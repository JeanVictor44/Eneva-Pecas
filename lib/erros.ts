export function mapErro(error: { code?: string; message?: string } | null): string {
  if (!error) return 'Erro desconhecido.'
  // 42501 = insufficient_privilege: o RLS barrou a operação.
  if (error.code === '42501' || /row-level security/i.test(error.message ?? '')) {
    return 'Você não tem permissão para esta ação.'
  }
  // 23505 = unique_violation (Postgres)
  if (error.code === '23505' || /duplicate key/i.test(error.message ?? '')) {
    return 'SKU já cadastrado.'
  }
  return error.message ?? 'Ocorreu um erro.'
}
