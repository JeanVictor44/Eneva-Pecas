import { createClient } from '@/lib/supabase/server'
import { BUCKET_FOTOS, BUCKET_DOCS } from '@/lib/storage'
import type { Anexo, Trinca, Categoria } from '@/lib/tipos'

export type PecaLista = {
  id: string
  descricao: string
  referencias: Trinca[]
  categoria: Categoria | null
  capaUrl: string | null
  qtdFotos: number
  qtdDocs: number
}

export type AnexoComUrl = Anexo & { url: string }

export type PecaDetalheData = {
  id: string
  descricao: string
  referencias: Trinca[]
  categoria: Categoria | null
  created_at: string
  fotos: AnexoComUrl[]
  documentos: AnexoComUrl[]
}

export async function listarPecas(): Promise<PecaLista[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pecas')
    .select(
      'id, descricao, categoria:categorias(id, nome), referencias:pecas_referencias(sku, part_number, fabricante, ordem), anexos:pecas_anexos(tipo, path, created_at)',
    )
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

    const referencias = ((p.referencias ?? []) as (Trinca & { ordem: number })[])
      .sort((a, b) => a.ordem - b.ordem)
      .map(({ sku, part_number, fabricante }) => ({ sku, part_number, fabricante }))

    return {
      id: p.id,
      descricao: p.descricao,
      referencias,
      categoria: (
        Array.isArray(p.categoria)
          ? (p.categoria[0] ?? null)
          : (p.categoria ?? null)
      ) as Categoria | null,
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
    .select(
      'id, descricao, created_at, categoria:categorias(id, nome), referencias:pecas_referencias(sku, part_number, fabricante, ordem), anexos:pecas_anexos(*)',
    )
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

  const referencias = ((data.referencias ?? []) as (Trinca & { ordem: number })[])
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ sku, part_number, fabricante }) => ({ sku, part_number, fabricante }))

  return {
    id: data.id,
    descricao: data.descricao,
    referencias,
    categoria: (
      Array.isArray(data.categoria)
        ? (data.categoria[0] ?? null)
        : (data.categoria ?? null)
    ) as Categoria | null,
    created_at: data.created_at,
    fotos,
    documentos,
  }
}

export async function listarCategorias(): Promise<Categoria[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nome')
    .order('nome', { ascending: true })
  if (error) throw error
  return (data ?? []) as Categoria[]
}
