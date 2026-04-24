import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL')
if (!supabaseAnonKey) throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY')

const _url: string = supabaseUrl
const _key: string = supabaseAnonKey

let browserClient: SupabaseClient | null = null

export function getBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient
  browserClient = createClient(_url, _key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  return browserClient
}

export const supabase = getBrowserClient()
