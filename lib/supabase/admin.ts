import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Cliente com a service role key: IGNORA RLS por completo.
// Só use depois de checar a permissão com exigir() ou perfilAtual() —
// 'gerir_usuarios' em geral; lib/ranking.ts usa 'visualizar' e só expõe nome/e-mail.
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient() não pode ser usado no browser.')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.',
    )
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
