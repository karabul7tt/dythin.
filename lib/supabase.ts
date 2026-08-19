import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
// HTTPS Zorunluluğu: Bağlantının her zaman şifreli HTTPS üzerinden yapılmasını zorunlu kılar
const SUPABASE_URL = rawUrl.startsWith('http://')
  ? rawUrl.replace('http://', 'https://')
  : rawUrl

const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase URL ve Anon Key .env dosyasından okunamadı. Lütfen .env dosyanızı kontrol edin.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'X-Client-Info': 'dythin-mobile-v1',
      'X-Content-Type-Options': 'nosniff',
    },
  },
})
