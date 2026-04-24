import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

let browserClient: SupabaseClient | null = null

export function getBrowserClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    // During static prerendering, env vars may not be available.
    // Return a no-op client that won't throw at build time.
    return createClient('https://placeholder.supabase.co', 'placeholder-key')
  }
  if (browserClient) return browserClient
  browserClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  return browserClient
}

export const supabase = getBrowserClient()
