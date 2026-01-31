import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | null = null

/**
 * Client-side Supabase instance getter (SSR/ビルド時にも安全).
 *
 * 必要な環境変数:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
export function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null
  if (client) return client
  client = createClient(supabaseUrl, supabaseAnonKey)
  return client
}

export function assertSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      [
        "Supabaseの環境変数が未設定です。.env.local に以下を追加してください。",
        "",
        "NEXT_PUBLIC_SUPABASE_URL=...",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY=...",
      ].join("\n")
    )
  }
}

