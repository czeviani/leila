import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

// Admin client — bypasses RLS, use only in service operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

// Factory for user-scoped clients (with JWT)
export const createUserSupabase = (accessToken: string) =>
  createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
