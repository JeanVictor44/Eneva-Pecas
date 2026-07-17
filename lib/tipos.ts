export type TipoAnexo = 'foto' | 'documento'

export type Anexo = {
  id: string
  peca_id: string
  tipo: TipoAnexo
  path: string
  nome: string | null
  mime_type: string | null
  tamanho: number | null
  created_at: string
}
