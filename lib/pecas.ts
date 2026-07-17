import { createClient } from '@/lib/supabase/server'
import { BUCKET_FOTOS, BUCKET_DOCS } from '@/lib/storage'
import type { Anexo } from '@/lib/tipos'

export type PecaLista = {
  id: string
  sku: string
  part_number: string
  descricao: string
  capaUrl: string | null
  qtdFotos: number
  qtdDocs: number
}

export type AnexoComUrl = Anexo & { url: string }

export type PecaDetalheData = {
  id: string
  sku: string
  part_number: string
  descricao: string
  created_at: string
  fotos: AnexoComUrl[]
  documentos: AnexoComUrl[]
}

export async function listarPecas(): Promise<PecaLista[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pecas')
    .select('id, sku, part_number, descricao, anexos:pecas_anexos(tipo, path, created_at)')
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data ?? []).map((p) => {
    const anexos = (p.anexos ?? []) as { tipo: string; path: string; created_at: string }[]
    const fotos = anexos.filter((a) => a.tipo === 'foto').sort((a, b) => a.created_at.localeCompare(b.created_at))
    const docs = anexos.filter((a) => a.tipo === 'documento')
    const capa = fotos[0]
    const capaUrl = capa
      ? supabase.storage.from(BUCKET_FOTOS).getPublicUrl(capa.path).data.publicUrl
      : null
    return {
      id: p.id,
      sku: p.sku,
      part_number: p.part_number,
      descricao: p.descricao,
      capaUrl,
      qtdFotos: fotos.length,
      qtdDocs: docs.length,
    }
  })
}

export async function buscarPeca(id: string): Promise<PecaDetalheData | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pecas')
    .select('id, sku, part_number, descricao, created_at, anexos:pecas_anexos(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const anexos = (data.anexos ?? []) as Anexo[]

  const fotos: AnexoComUrl[] = anexos
    .filter((a) => a.tipo === 'foto')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((a) => ({
      ...a,
      url: supabase.storage.from(BUCKET_FOTOS).getPublicUrl(a.path).data.publicUrl,
    }))

  const documentos: AnexoComUrl[] = []
  for (const a of anexos.filter((x) => x.tipo === 'documento').sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const { data: signed, error: erroAssinatura } = await supabase
      .storage
      .from(BUCKET_DOCS)
      .createSignedUrl(a.path, 3600)
    if (erroAssinatura) {
      console.error('Falha ao assinar URL do documento:', a.path, erroAssinatura.message)
    }
    documentos.push({ ...a, url: signed?.signedUrl ?? '#' })
  }

  return {
    id: data.id,
    sku: data.sku,
    part_number: data.part_number,
    descricao: data.descricao,
    created_at: data.created_at,
    fotos,
    documentos,
  }
}
