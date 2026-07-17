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

  for (const { bucket, tipo, file } of jobs) {
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const path = `pecas/${pecaId}/${crypto.randomUUID()}.${ext}`

    const up = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type || undefined,
    })
    if (up.error) return `Falha ao enviar ${tipo}: ${up.error.message}`

    const ins = await supabase.from('pecas_anexos').insert({
      peca_id: pecaId,
      tipo,
      path,
      nome: file.name,
      mime_type: file.type || null,
      tamanho: file.size,
    })
    if (ins.error) return `Falha ao registrar ${tipo}: ${ins.error.message}`
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
  if (erroAnexo) return { erro: erroAnexo }

  revalidatePath('/pecas')
  redirect('/pecas')
}
