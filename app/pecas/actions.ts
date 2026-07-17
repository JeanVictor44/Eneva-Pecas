'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { BUCKET_FOTOS, BUCKET_DOCS } from '@/lib/storage'
import { mapErro } from '@/lib/erros'
import { buscarPeca, type PecaDetalheData } from '@/lib/pecas'
import type { Trinca } from '@/lib/tipos'

export type EstadoPeca = { erro: string | null; ok: boolean }

function arquivosDe(formData: FormData, campo: string): File[] {
  return formData
    .getAll(campo)
    .filter((f): f is File => f instanceof File && f.size > 0)
}

function trincasDe(formData: FormData): Trinca[] {
  const skus = formData.getAll('trinca_sku').map((v) => String(v).trim())
  const pns = formData.getAll('trinca_part_number').map((v) => String(v).trim())
  const fabs = formData.getAll('trinca_fabricante').map((v) => String(v).trim())
  return skus.map((sku, i) => ({
    sku,
    part_number: pns[i] ?? '',
    fabricante: fabs[i] ?? '',
  }))
}

function trincasValidas(trincas: Trinca[]): boolean {
  return (
    trincas.length > 0 &&
    trincas.every((t) => t.sku && t.part_number && t.fabricante)
  )
}

async function resolverCategoria(
  supabase: SupabaseClient,
  nomeBruto: string,
): Promise<{ id: string | null; erro: string | null }> {
  const nome = nomeBruto.trim()
  if (!nome) return { id: null, erro: null }

  // 1) Busca case-insensitive por categoria existente.
  const { data: existente, error: erroBusca } = await supabase
    .from('categorias')
    .select('id')
    .ilike('nome', nome)
    .maybeSingle()
  if (erroBusca) return { id: null, erro: mapErro(erroBusca) }
  if (existente) return { id: existente.id, erro: null }

  // 2) Não existe: cria. Em corrida (23505 no índice lower(nome)), re-seleciona.
  const { data: nova, error: erroInsert } = await supabase
    .from('categorias')
    .insert({ nome })
    .select('id')
    .single()
  if (!erroInsert) return { id: nova.id, erro: null }

  const { data: reencontrada } = await supabase
    .from('categorias')
    .select('id')
    .ilike('nome', nome)
    .maybeSingle()
  if (reencontrada) return { id: reencontrada.id, erro: null }
  return { id: null, erro: mapErro(erroInsert) }
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
  const descricao = String(formData.get('descricao') ?? '').trim()
  const trincas = trincasDe(formData)

  if (!descricao) return { erro: 'Preencha a descrição.', ok: false }
  if (!trincasValidas(trincas)) {
    return { erro: 'Cada trinca precisa de SKU, part number e fabricante.', ok: false }
  }

  const supabase = await createClient()
  const cat = await resolverCategoria(supabase, String(formData.get('categoria') ?? ''))
  if (cat.erro) return { erro: cat.erro, ok: false }

  const { data: peca, error } = await supabase
    .from('pecas')
    .insert({ descricao, categoria_id: cat.id })
    .select('id')
    .single()
  if (error) return { erro: mapErro(error), ok: false }

  const { error: erroRef } = await supabase
    .from('pecas_referencias')
    .insert(trincas.map((t, i) => ({ peca_id: peca.id, ...t, ordem: i })))
  if (erroRef) {
    const { error: erroLimpeza } = await supabase.from('pecas').delete().eq('id', peca.id)
    if (erroLimpeza) {
      console.error('Falha ao remover peça órfã:', peca.id, erroLimpeza.message)
    }
    return { erro: mapErro(erroRef), ok: false }
  }

  const erroAnexo = await enviarAnexos(
    supabase,
    peca.id,
    arquivosDe(formData, 'fotos'),
    arquivosDe(formData, 'documentos'),
  )
  if (erroAnexo) {
    const { error: erroLimpeza } = await supabase.from('pecas').delete().eq('id', peca.id)
    if (erroLimpeza) {
      console.error('Falha ao remover peça órfã:', peca.id, erroLimpeza.message)
    }
    return { erro: erroAnexo, ok: false }
  }

  revalidatePath('/pecas')
  return { erro: null, ok: true }
}

export async function atualizarPeca(
  id: string,
  _prev: EstadoPeca,
  formData: FormData,
): Promise<EstadoPeca> {
  const descricao = String(formData.get('descricao') ?? '').trim()
  const trincas = trincasDe(formData)

  if (!descricao) return { erro: 'Preencha a descrição.', ok: false }
  if (!trincasValidas(trincas)) {
    return { erro: 'Cada trinca precisa de SKU, part number e fabricante.', ok: false }
  }

  const supabase = await createClient()
  const cat = await resolverCategoria(supabase, String(formData.get('categoria') ?? ''))
  if (cat.erro) return { erro: cat.erro, ok: false }

  const { error: erroUpdate } = await supabase
    .from('pecas')
    .update({ descricao, categoria_id: cat.id })
    .eq('id', id)
  if (erroUpdate) return { erro: mapErro(erroUpdate), ok: false }

  // Substitui as trincas (replace-all). O delete+insert não é atômico (risco
  // aceito no spec); por isso guardamos as trincas atuais e as restauramos se o
  // insert falhar (ex.: SKU duplicado), para nunca deixar a peça sem identidade.
  const { data: trincasAnteriores } = await supabase
    .from('pecas_referencias')
    .select('sku, part_number, fabricante, ordem')
    .eq('peca_id', id)

  const { error: erroDel } = await supabase
    .from('pecas_referencias')
    .delete()
    .eq('peca_id', id)
  if (erroDel) return { erro: mapErro(erroDel), ok: false }

  const { error: erroRef } = await supabase
    .from('pecas_referencias')
    .insert(trincas.map((t, i) => ({ peca_id: id, ...t, ordem: i })))
  if (erroRef) {
    // Best-effort: recoloca as trincas anteriores para não perder a identidade da peça.
    if (trincasAnteriores?.length) {
      const { error: erroRestauro } = await supabase
        .from('pecas_referencias')
        .insert(trincasAnteriores.map((r) => ({ peca_id: id, ...r })))
      if (erroRestauro) {
        console.error(
          'Falha ao restaurar trincas após erro no update:',
          id,
          erroRestauro.message,
        )
      }
    }
    return { erro: mapErro(erroRef), ok: false }
  }

  // Remoção de anexos marcados (bloco existente — manter como está)
  const removerIds = formData.getAll('remover').map((v) => String(v))
  if (removerIds.length) {
    const { data: aRem } = await supabase
      .from('pecas_anexos')
      .select('id, tipo, path')
      .eq('peca_id', id)
      .in('id', removerIds)

    const fotos = (aRem ?? []).filter((a) => a.tipo === 'foto').map((a) => a.path)
    const docs = (aRem ?? []).filter((a) => a.tipo === 'documento').map((a) => a.path)
    if (fotos.length) await supabase.storage.from(BUCKET_FOTOS).remove(fotos)
    if (docs.length) await supabase.storage.from(BUCKET_DOCS).remove(docs)
    await supabase.from('pecas_anexos').delete().eq('peca_id', id).in('id', removerIds)
  }

  const erroAnexo = await enviarAnexos(
    supabase,
    id,
    arquivosDe(formData, 'fotos'),
    arquivosDe(formData, 'documentos'),
  )
  if (erroAnexo) return { erro: erroAnexo, ok: false }

  revalidatePath('/pecas')
  return { erro: null, ok: true }
}

export async function excluirPeca(id: string): Promise<EstadoPeca> {
  const supabase = await createClient()

  const { data: anexos } = await supabase
    .from('pecas_anexos')
    .select('tipo, path')
    .eq('peca_id', id)

  // Remove a peça primeiro (o cascade limpa as linhas de pecas_anexos);
  // só então apaga os arquivos do Storage, evitando registro sem arquivos.
  const { error } = await supabase.from('pecas').delete().eq('id', id)
  if (error) {
    console.error('Erro ao excluir peça:', error.message)
    return { erro: mapErro(error), ok: false }
  }

  const fotos = (anexos ?? []).filter((a) => a.tipo === 'foto').map((a) => a.path)
  const docs = (anexos ?? []).filter((a) => a.tipo === 'documento').map((a) => a.path)
  if (fotos.length) await supabase.storage.from(BUCKET_FOTOS).remove(fotos)
  if (docs.length) await supabase.storage.from(BUCKET_DOCS).remove(docs)

  revalidatePath('/pecas')
  return { erro: null, ok: true }
}

export async function carregarPeca(id: string): Promise<PecaDetalheData | null> {
  return buscarPeca(id)
}
