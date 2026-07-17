export function mapErro(error: { code?: string; message?: string } | null): string {
  if (!error) return 'Erro desconhecido.'
  // 23505 = unique_violation (Postgres)
  if (error.code === '23505' || /duplicate key/i.test(error.message ?? '')) {
    return 'SKU já cadastrado.'
  }
  return error.message ?? 'Ocorreu um erro.'
}
