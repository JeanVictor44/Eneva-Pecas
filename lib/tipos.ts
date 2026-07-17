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

// Uma trinca de identificação: mesma forma no formulário e na exibição.
export type Trinca = {
  sku: string
  part_number: string
  fabricante: string
}

// Linha persistida em pecas_referencias.
export type Referencia = Trinca & {
  id: string
  peca_id: string
  ordem: number
  created_at: string
}
