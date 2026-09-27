import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_SUPABASE_URL = 'https://eguivjrxxgomrfmfqjax.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVndWl2anJ4eGdvbXJmbWZxamF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDc4ODMsImV4cCI6MjA5MzYyMzg4M30.UhwFk8MbGYuW420qZjIWb0QnlCfv9BxVdoSfYHPoCOY'

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL
// HTTPS Zorunluluğu: Bağlantının her zaman şifreli HTTPS üzerinden yapılmasını zorunlu kılar
const SUPABASE_URL = rawUrl.startsWith('http://')
  ? rawUrl.replace('http://', 'https://')
  : rawUrl

const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
  global: {
    headers: {
      'X-Client-Info': 'dythin-mobile-v1',
    },
  },
})
