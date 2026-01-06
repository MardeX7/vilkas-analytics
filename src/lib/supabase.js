import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('🔧 Supabase config:', {
  url: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'NOT SET',
  hasKey: !!supabaseAnonKey
})

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase environment variables not set!')
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
)
