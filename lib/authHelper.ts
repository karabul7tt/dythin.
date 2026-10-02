import { supabase } from './supabase'

export function extractAuthFromUrl(url: string | null | undefined) {
  if (!url) return null
  let accessToken: string | null = null
  let refreshToken: string | null = null
  let code: string | null = null
  let error: string | null = null
  let errorDescription: string | null = null

  if (url.includes('#')) {
    const hash = url.split('#')[1]
    const params = new URLSearchParams(hash)
    accessToken = params.get('access_token')
    refreshToken = params.get('refresh_token')
    code = params.get('code')
    error = params.get('error')
    errorDescription = params.get('error_description')
  }

  if (url.includes('?')) {
    const query = url.split('?')[1].split('#')[0]
    const params = new URLSearchParams(query)
    if (!accessToken) accessToken = params.get('access_token')
    if (!refreshToken) refreshToken = params.get('refresh_token')
    if (!code) code = params.get('code')
    if (!error) error = params.get('error')
    if (!errorDescription) errorDescription = params.get('error_description')
  }

  return { accessToken, refreshToken, code, error, errorDescription }
}

export function extractUserProfile(user: any) {
  if (!user) return { name: null, avatar: null, email: null, usernameBase: 'user' }
  const meta = user.user_metadata || {}
  const googleIdentity = user.identities?.find((i: any) => i.provider === 'google') || user.identities?.[0]
  const idData = googleIdentity?.identity_data || {}

  const rawName =
    meta.full_name ||
    meta.name ||
    idData.full_name ||
    idData.name ||
    (meta.given_name ? `${meta.given_name} ${meta.family_name || ''}`.trim() : null) ||
    (idData.given_name ? `${idData.given_name} ${idData.family_name || ''}`.trim() : null) ||
    meta.displayName ||
    idData.displayName ||
    null

  const rawAvatar =
    meta.avatar_url ||
    meta.picture ||
    idData.avatar_url ||
    idData.picture ||
    meta.avatar ||
    idData.avatar ||
    null

  const email = user.email || meta.email || idData.email || null
  const usernameBase = (
    meta.preferred_username ||
    idData.preferred_username ||
    (rawName ? rawName.replace(/[^a-zA-Z0-9_]/g, '_') : null) ||
    (email ? email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') : null) ||
    'user'
  ).toLowerCase().slice(0, 16)

  return {
    name: rawName,
    avatar: rawAvatar,
    email,
    usernameBase,
  }
}

export async function syncUserProfileWithDatabase(user: any) {
  if (!user?.id) return null
  try {
    const { name, avatar, email, usernameBase } = extractUserProfile(user)

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, username, email, role')
      .eq('id', user.id)
      .maybeSingle()

    if (!existingProfile) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000)
      const autoUsername = `${usernameBase}_${randomSuffix}`

      const newRecord = {
        id: user.id,
        username: autoUsername,
        full_name: name || (email ? email.split('@')[0] : 'Kullanıcı'),
        avatar_url: avatar,
        email: email,
        role: email?.toLowerCase() === 'mehmetkarabul7tt@gmail.com' || user.user_metadata?.username?.toLowerCase() === 'mehmetkarabul7tt'
          ? 'admin'
          : 'user',
      }
      await supabase.from('profiles').insert(newRecord)
      return newRecord
    } else {
      const updates: any = {}
      const isFounder =
        existingProfile.username?.toLowerCase() === 'mehmetkarabul7tt' ||
        existingProfile.email?.toLowerCase() === 'mehmetkarabul7tt@gmail.com' ||
        email?.toLowerCase() === 'mehmetkarabul7tt@gmail.com'
      if (isFounder && existingProfile.role !== 'admin') updates.role = 'admin'
      if (isFounder && !existingProfile.username) updates.username = 'mehmetkarabul7tt'
      if ((!existingProfile.full_name || existingProfile.full_name === 'Kullanıcı' || existingProfile.full_name.trim() === '') && name) {
        updates.full_name = name
      }
      if ((!existingProfile.avatar_url || existingProfile.avatar_url.trim() === '') && avatar) {
        updates.avatar_url = avatar
      }
      if (email && !(existingProfile as any).email) {
        updates.email = email
      }
      if (isFounder && !(existingProfile as any).email && email) {
        updates.email = 'mehmetkarabul7tt@gmail.com'
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('profiles').update(updates).eq('id', user.id)
        return { ...existingProfile, ...updates }
      }
      return existingProfile
    }
  } catch (err) {
    console.warn('syncUserProfileWithDatabase error:', err)
    return null
  }
}

export async function authenticateFromUrl(url: string | null | undefined): Promise<boolean> {
  if (!url) return false
  const parsed = extractAuthFromUrl(url)
  if (!parsed) return false

  if (parsed.error || parsed.errorDescription) {
    const errorMsg = parsed.errorDescription || parsed.error || 'Bilinmeyen kimlik doğrulama hatası'
    throw new Error(`Google/Supabase Hatası: ${errorMsg}`)
  }

  try {
    let session = null

    if (parsed.accessToken && parsed.refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      })
      if (!error && data?.session) {
        session = data.session
      }
    }

    if (!session && parsed.code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(parsed.code)
      if (!error && data?.session) {
        session = data.session
      } else {
        const { data: cur } = await supabase.auth.getSession()
        if (cur?.session) session = cur.session
      }
    }

    if (!session) {
      const { data: cur } = await supabase.auth.getSession()
      if (cur?.session) session = cur.session
    }

    if (session?.user) {
      await syncUserProfileWithDatabase(session.user)
      return true
    }
  } catch (e: any) {
    console.warn('[authHelper] authenticateFromUrl error:', e)
    throw e
  }

  return false
}
