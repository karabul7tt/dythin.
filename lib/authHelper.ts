import { supabase } from './supabase'

export function extractAuthFromUrl(url: string | null | undefined) {
  if (!url) return null
  let accessToken: string | null = null
  let refreshToken: string | null = null
  let code: string | null = null

  // 1. Hash Fragment (#access_token=...&refresh_token=...)
  if (url.includes('#')) {
    const hash = url.split('#')[1]
    const params = new URLSearchParams(hash)
    accessToken = params.get('access_token')
    refreshToken = params.get('refresh_token')
    code = params.get('code')
  }

  // 2. Query Parameters (?code=... or ?access_token=...)
  if (url.includes('?')) {
    const query = url.split('?')[1].split('#')[0]
    const params = new URLSearchParams(query)
    if (!accessToken) accessToken = params.get('access_token')
    if (!refreshToken) refreshToken = params.get('refresh_token')
    if (!code) code = params.get('code')
  }

  return { accessToken, refreshToken, code }
}

export async function authenticateFromUrl(url: string | null | undefined): Promise<boolean> {
  if (!url) return false
  const parsed = extractAuthFromUrl(url)
  if (!parsed) return false

  try {
    // 1. If explicit access_token and refresh_token are present:
    if (parsed.accessToken && parsed.refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      })
      if (!error && data?.session) {
        return true
      }
    }

    // 2. If PKCE authorization code is present:
    if (parsed.code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(parsed.code)
      if (!error && data?.session) {
        return true
      }
    }

    // 3. Fallback: check if session is already active
    const { data: cur } = await supabase.auth.getSession()
    if (cur?.session) {
      return true
    }
  } catch (e) {
    console.warn('authenticateFromUrl error:', e)
  }

  return false
}
