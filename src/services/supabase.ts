/**
 * Supabase client bootstrap.
 *
 * The client is built from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
 * — both must be present for persistence to be active. When either is
 * missing the module exports `null` and `isSupabaseConfigured()` returns
 * false so the rest of the app can fall back to in-memory mode without
 * crashing.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[Supabase] Not configured — local changes will not persist. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env',
  )
}

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

export function isSupabaseConfigured(): boolean {
  return supabase !== null
}
