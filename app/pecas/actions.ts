'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { BUCKET_FOTOS, BUCKET_DOCS } from '@/lib/storage'
import { mapErro } from '@/lib/erros'

export type EstadoPeca = { erro: string | null }

function arquivosDe(formData: FormData, campo: string): File[] {
  return formData
    .getAll(campo)
    .filter((f): f is File => f instanceof File && f.size > 0)
}

async function enviarAnexos(
  supabase: SupabaseClient,
  pecaId: string,
  fotos: File[],
  documentos: File[],
): Promise<string | null> {
  const jobs: { bucket: string; tipo: 'foto' | 'documento'; file: File }[] = [
    ...fotos.map((file) => ({ bucket: BUCKET_FOTOS, tipo: 'foto' as const, file })),
    ...documentos.map((file) => ({ bucket: BUCKET_DOCS, tipo: 'documento' as const, file })),
  ]

  // Arquivos já enviados nesta chamada, para limpeza em caso de falha parcial
  const enviados: { bucket: string; path: string }[] = []

  async function limparEnviados() {
    for (const { bucket, path } of enviados) {
      const { error } = await supabase.storage.from(bucket).remove([path])
      if (error) {
        console.error('Falha ao limpar arquivo órfão:', bucket, path, error.message)
      }
    }
    const paths = enviados.map((e) => e.path)
    if (paths.length) {
      const { error } = await supabase.from('pecas_anexos').delete().in('path', paths)
      if (error) {
        console.error('Falha ao limpar linhas de anexo órfãs:', error.message)
      }
    }
  }

  for (const { bucket, tipo, file } of jobs) {
    const raw = file.name.includes('.') ? file.name.split('.').pop() : ''
    const ext = raw || 'bin'
    const path = `pecas/${pecaId}/${crypto.randomUUID()}.${ext}`

    const up = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type || undefined,
    })
    if (up.error) {
      console.error('Falha no upload:', bucket, path, up.error.message)
      await limparEnviados()
      return `Falha ao enviar ${tipo}: ${up.error.message}`
    }
    enviados.push({ bucket, path })

    const ins = await supabase.from('pecas_anexos').insert({
      peca_id: pecaId,
      tipo,
      path,
      nome: file.name,
      mime_type: file.type || null,
      tamanho: file.size,
    })
    if (ins.error) {
      console.error('Falha ao registrar anexo:', bucket, path, ins.error.message)
      await limparEnviados()
      return `Falha ao registrar ${tipo}: ${ins.error.message}`
    }
  }
  return null
}

export async function criarPeca(
  _prev: EstadoPeca,
  formData: FormData,
): Promise<EstadoPeca> {
  const sku = String(formData.get('sku') ?? '').trim()
  const part_number = String(formData.get('part_number') ?? '').trim()
  const descricao = String(formData.get('descricao') ?? '').trim()

  if (!sku || !part_number || !descricao) {
    return { erro: 'Preencha SKU, part number e descrição.' }
  }

  const supabase = await createClient()
  const { data: peca, error } = await supabase
    .from('pecas')
    .insert({ sku, part_number, descricao })
    .select('id')
    .single()
  if (error) return { erro: mapErro(error) }

  const erroAnexo = await enviarAnexos(
    supabase,
    peca.id,
    arquivosDe(formData, 'fotos'),
    arquivosDe(formData, 'documentos'),
  )
  if (erroAnexo) {
    // Desfaz a peça recém-criada para não deixar registro órfão nem
    // bloquear um novo cadastro com o mesmo SKU (cascade limpa anexos).
    const { error: erroLimpeza } = await supabase.from('pecas').delete().eq('id', peca.id)
    if (erroLimpeza) {
      console.error('Falha ao remover peça órfã:', peca.id, erroLimpeza.message)
    }
    return { erro: erroAnexo }
  }

  revalidatePath('/pecas')
  redirect('/pecas')
}

export async function excluirPeca(id: string, _formData?: FormData) {
  const supabase = await createClient()

  const { data: anexos } = await supabase
    .from('pecas_anexos')
    .select('tipo, path')
    .eq('peca_id', id)

  const fotos = (anexos ?? []).filter((a) => a.tipo === 'foto').map((a) => a.path)
  const docs = (anexos ?? []).filter((a) => a.tipo === 'documento').map((a) => a.path)

  if (fotos.length) await supabase.storage.from(BUCKET_FOTOS).remove(fotos)
  if (docs.length) await supabase.storage.from(BUCKET_DOCS).remove(docs)

  // Cascade remove as linhas de pecas_anexos
  const { error } = await supabase.from('pecas').delete().eq('id', id)
  if (error) console.error('Erro ao excluir peça:', error.message)

  revalidatePath('/pecas')
  redirect('/pecas')
}
