import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

export const SUPER_ADMIN_USERNAMES = [
  'mehmetkarabul7tt',
]

export const SUPER_ADMIN_EMAILS = [
  'mehmetkarabul7tt@gmail.com',
]

const PROMOTED_ADMINS_STORAGE_KEY = '@dythin_promoted_admins_v2'
const REVOKED_ADMINS_STORAGE_KEY = '@dythin_revoked_admins_v2'
const BANNED_USERS_STORAGE_KEY = '@dythin_banned_users_v2'

export async function getLocallyBannedUsers(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(BANNED_USERS_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set(parsed)
    return new Set()
  } catch {
    return new Set()
  }
}

export async function addLocallyBannedUser(userId: string): Promise<void> {
  try {
    const set = await getLocallyBannedUsers()
    set.add(userId)
    await AsyncStorage.setItem(BANNED_USERS_STORAGE_KEY, JSON.stringify(Array.from(set)))
  } catch {}
}

export async function removeLocallyBannedUser(userId: string): Promise<void> {
  try {
    const set = await getLocallyBannedUsers()
    set.delete(userId)
    await AsyncStorage.setItem(BANNED_USERS_STORAGE_KEY, JSON.stringify(Array.from(set)))
  } catch {}
}

export async function getLocallyPromotedAdmins(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(PROMOTED_ADMINS_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set(parsed)
    return new Set()
  } catch {
    return new Set()
  }
}

export async function addLocallyPromotedAdmin(userId: string): Promise<void> {
  try {
    const set = await getLocallyPromotedAdmins()
    set.add(userId)
    await AsyncStorage.setItem(PROMOTED_ADMINS_STORAGE_KEY, JSON.stringify(Array.from(set)))
  } catch {}
}

export async function removeLocallyPromotedAdmin(userId: string): Promise<void> {
  try {
    const set = await getLocallyPromotedAdmins()
    set.delete(userId)
    await AsyncStorage.setItem(PROMOTED_ADMINS_STORAGE_KEY, JSON.stringify(Array.from(set)))
  } catch {}
}

export async function getLocallyRevokedAdmins(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(REVOKED_ADMINS_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set(parsed)
    return new Set()
  } catch {
    return new Set()
  }
}

export async function addLocallyRevokedAdmin(userId: string): Promise<void> {
  try {
    const set = await getLocallyRevokedAdmins()
    set.add(userId)
    await AsyncStorage.setItem(REVOKED_ADMINS_STORAGE_KEY, JSON.stringify(Array.from(set)))
  } catch {}
}

export async function removeLocallyRevokedAdmin(userId: string): Promise<void> {
  try {
    const set = await getLocallyRevokedAdmins()
    set.delete(userId)
    await AsyncStorage.setItem(REVOKED_ADMINS_STORAGE_KEY, JSON.stringify(Array.from(set)))
  } catch {}
}

export function isSuperAdminUser(identifier?: string | null): boolean {
  if (!identifier) return false
  const clean = identifier.toLowerCase().replace('@', '').trim()
  return SUPER_ADMIN_USERNAMES.includes(clean) || SUPER_ADMIN_EMAILS.includes(clean)
}

export async function checkIsUserBanned(
  userId?: string | null,
  username?: string | null,
  email?: string | null
): Promise<boolean> {
  // 1. Kurucu (Süper Admin) ASLA banlanamaz
  if (isSuperAdminUser(username) || isSuperAdminUser(email)) return false
  if (userId) {
    const isSuper = await checkIsSuperAdmin(userId, username, email)
    if (isSuper) return false
  }

  // 2. Yerel cihaz önbelleğinde banlı mı?
  if (userId) {
    try {
      const localBanned = await getLocallyBannedUsers()
      if (localBanned.has(userId)) return true
    } catch {}
  }

  let cleanUser = (username || '').toLowerCase().replace('@', '').trim()

  // 3. Veritabanındaki son ban / unban denetim loglarını kontrol et
  try {
    const { data } = await supabase
      .from('reports')
      .select('reason, created_at')
      .or(`reason.like.ADMIN_ACTION:BAN_USER:%,reason.like.ADMIN_ACTION:UNBAN_USER:%`)
      .order('created_at', { ascending: false })

    if (data && data.length > 0) {
      for (const row of data) {
        const isUserMatch =
          (cleanUser && row.reason.toLowerCase().includes(`:@${cleanUser}`)) ||
          (userId && row.reason.includes(`:${userId}:`))
        if (isUserMatch) {
          if (row.reason.startsWith('ADMIN_ACTION:UNBAN_USER:')) {
            if (userId) removeLocallyBannedUser(userId).catch(() => {})
            return false
          }
          if (row.reason.startsWith('ADMIN_ACTION:BAN_USER:')) {
            if (userId) addLocallyBannedUser(userId).catch(() => {})
            return true
          }
        }
      }
    }
  } catch {}

  // 4. Veritabanı profiller tablosundaki rol kontrolü (role === 'banned')
  if (userId) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, username, email')
        .eq('id', userId)
        .maybeSingle()

      if (profile) {
        if (isSuperAdminUser(profile.username) || isSuperAdminUser(profile.email)) return false
        if (profile.role === 'banned') {
          addLocallyBannedUser(userId).catch(() => {})
          return true
        }
      }
    } catch {}
  }

  return false
}

export async function checkIsSuperAdmin(
  userId?: string | null,
  username?: string | null,
  email?: string | null
): Promise<boolean> {
  if (isSuperAdminUser(username) || isSuperAdminUser(email)) return true
  if (!userId) return false
  try {
    const { data } = await supabase.from('profiles').select('username, email').eq('id', userId).maybeSingle()
    if (data && (isSuperAdminUser(data.username) || isSuperAdminUser(data.email))) {
      return true
    }
  } catch {}
  return false
}

export type AdminKPIs = {
  totalUsers: number
  totalPosts: number
  totalVotes: number
  pendingReports: number
  bannedCount: number
}

export type ReportedPostItem = {
  reportId: string
  reason: string
  createdAt: string
  reporterId: string
  reporterUsername?: string
  targetUserId?: string | null
  targetUsername?: string | null
  targetUserAvatar?: string | null
  post: {
    id: string
    title: string
    description?: string | null
    image_a_url: string
    image_b_url?: string | null
    created_at: string
    authorId: string
    authorUsername: string
    authorName?: string | null
    authorAvatar?: string | null
  } | null
}

export type AdminUserItem = {
  id: string
  username: string
  fullName?: string | null
  avatarUrl?: string | null
  email?: string | null
  createdAt: string
  isAdmin: boolean
  isBanned: boolean
  isSuperAdmin: boolean
}

export async function checkIsAdmin(
  username?: string | null,
  role?: string | null,
  userId?: string | null,
  email?: string | null
): Promise<boolean> {
  // 1. Kurucu (Super Admin) kontrolü - Yalnızca @mehmetkarabul7tt / mehmetkarabul7tt@gmail.com
  if (isSuperAdminUser(username) || isSuperAdminUser(email)) return true
  if (userId) {
    const isSuper = await checkIsSuperAdmin(userId, username, email)
    if (isSuper) return true
  }

  // 2. Eğer bu kullanıcı için yetki kaldırılmışsa (revoked) ASLA admin değildir
  if (userId) {
    try {
      const localRevoked = await getLocallyRevokedAdmins()
      if (localRevoked.has(userId)) return false
    } catch {}
  }

  let cleanUser = (username || '').toLowerCase().replace('@', '').trim()

  // 3. Veritabanındaki admin rapor ve yetkilendirme aksiyonları (en güncel aksiyonu uygula)
  try {
    const { data } = await supabase
      .from('reports')
      .select('reason, created_at')
      .or(`reason.like.ADMIN_ACTION:PROMOTE_ADMIN:%,reason.like.ADMIN_ACTION:REVOKE_ADMIN:%`)
      .order('created_at', { ascending: false })

    if (data && data.length > 0) {
      for (const row of data) {
        const isUserMatch = (cleanUser && row.reason.toLowerCase().includes(`:@${cleanUser}`)) ||
                            (userId && row.reason.includes(`:${userId}:`))
        if (isUserMatch) {
          if (row.reason.startsWith('ADMIN_ACTION:REVOKE_ADMIN:')) {
            return false
          }
          if (row.reason.startsWith('ADMIN_ACTION:PROMOTE_ADMIN:')) {
            return true
          }
        }
      }
    }
  } catch {}

  // 4. Yerel önbellekte kayıtlı admin mi?
  if (userId) {
    try {
      const localAdmins = await getLocallyPromotedAdmins()
      if (localAdmins.has(userId)) return true
    } catch {}
  }

  // 5. Auth session ve veritabanı profil / rol kontrolü
  if (userId) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, username, email')
        .eq('id', userId)
        .maybeSingle()

      if (profile) {
        if (isSuperAdminUser(profile.username) || isSuperAdminUser(profile.email)) return true
        if (profile.role === 'admin') return true
        if (profile.username) cleanUser = profile.username.toLowerCase().replace('@', '').trim()
      }
    } catch {}
  }

  if (role === 'admin') return true
  return false
}

export async function getAdminKPIs(): Promise<AdminKPIs> {
  let totalUsers = 0
  let totalPosts = 0
  let totalVotes = 0
  let pendingReports = 0
  let bannedCount = 0

  try {
    const [uRes, pRes, vRes, rRes, localBanned] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('votes').select('id', { count: 'exact', head: true }),
      supabase.from('reports').select('id, reason'),
      getLocallyBannedUsers(),
    ])

    totalUsers = uRes.count || 0
    totalPosts = pRes.count || 0
    totalVotes = vRes.count || 0

    const bannedSet = new Set<string>(localBanned)

    if (rRes.data) {
      pendingReports = rRes.data.filter(r => !r.reason?.startsWith('ADMIN_ACTION:')).length
      for (const r of rRes.data) {
        if (r.reason?.startsWith('ADMIN_ACTION:BAN_USER:')) {
          const uid = r.reason.split(':')[2]
          if (uid) bannedSet.add(uid)
        } else if (r.reason?.startsWith('ADMIN_ACTION:UNBAN_USER:')) {
          const uid = r.reason.split(':')[2]
          if (uid) bannedSet.delete(uid)
        }
      }
    }
    bannedCount = bannedSet.size
  } catch (err) {
    console.warn('getAdminKPIs error:', err)
  }

  return { totalUsers, totalPosts, totalVotes, pendingReports, bannedCount }
}

export async function getReportedPosts(): Promise<ReportedPostItem[]> {
  try {
    const { data: reports, error } = await supabase
      .from('reports')
      .select('id, reason, created_at, reporter_id, post_id, posts(*, profiles(*))')
      .order('created_at', { ascending: false })

    if (error || !reports) return []

    const userReports = reports.filter(r => !r.reason?.startsWith('ADMIN_ACTION:'))
    if (userReports.length === 0) return []

    const reporterIds = Array.from(new Set(userReports.map(r => r.reporter_id).filter(Boolean)))
    let reporterMap: Record<string, string> = {}
    if (reporterIds.length > 0) {
      const { data: reporters } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', reporterIds)
      reporters?.forEach(rp => {
        if (rp.username) reporterMap[rp.id] = rp.username
      })
    }

    // Profil bildirimi içeren raporlardaki kullanıcı adlarını veya ID'leri topla
    const profileLookupUsernames: string[] = []
    const profileLookupUserIds: string[] = []
    for (const r of userReports) {
      if (!r.posts && r.reason) {
        const idMatch = r.reason.match(/\[ID:([a-f0-9-]+)\]/i)
        if (idMatch && idMatch[1]) profileLookupUserIds.push(idMatch[1])
        const userMatch = r.reason.match(/@([a-zA-Z0-9_.]+)/)
        if (userMatch && userMatch[1]) profileLookupUsernames.push(userMatch[1].toLowerCase())
      }
    }

    let profileMapById: Record<string, { id: string; username: string; avatarUrl?: string | null }> = {}
    let profileMapByName: Record<string, { id: string; username: string; avatarUrl?: string | null }> = {}

    if (profileLookupUserIds.length > 0 || profileLookupUsernames.length > 0) {
      try {
        if (profileLookupUserIds.length > 0) {
          const { data: byIdData } = await supabase.from('profiles').select('id, username, avatar_url').in('id', profileLookupUserIds)
          byIdData?.forEach(p => {
            if (p.id) profileMapById[p.id] = { id: p.id, username: p.username, avatarUrl: p.avatar_url }
            if (p.username) profileMapByName[p.username.toLowerCase()] = { id: p.id, username: p.username, avatarUrl: p.avatar_url }
          })
        }
        if (profileLookupUsernames.length > 0) {
          const { data: byNameData } = await supabase.from('profiles').select('id, username, avatar_url').in('username', profileLookupUsernames)
          byNameData?.forEach(p => {
            if (p.id) profileMapById[p.id] = { id: p.id, username: p.username, avatarUrl: p.avatar_url }
            if (p.username) profileMapByName[p.username.toLowerCase()] = { id: p.id, username: p.username, avatarUrl: p.avatar_url }
          })
        }
      } catch {}
    }

    return userReports.map(r => {
      const p = (r as any).posts
      const author = p?.profiles
      let targetUserId: string | null = null
      let targetUsername: string | null = null
      let targetUserAvatar: string | null = null

      if (p) {
        targetUserId = p.user_id
        targetUsername = author?.username || 'kullanici'
        targetUserAvatar = author?.avatar_url || null
      } else if (r.reason) {
        const idMatch = r.reason.match(/\[ID:([a-f0-9-]+)\]/i)
        const userMatch = r.reason.match(/@([a-zA-Z0-9_.]+)/)
        if (idMatch && profileMapById[idMatch[1]]) {
          const prof = profileMapById[idMatch[1]]
          targetUserId = prof.id
          targetUsername = prof.username
          targetUserAvatar = prof.avatarUrl || null
        } else if (userMatch && profileMapByName[userMatch[1].toLowerCase()]) {
          const prof = profileMapByName[userMatch[1].toLowerCase()]
          targetUserId = prof.id
          targetUsername = prof.username
          targetUserAvatar = prof.avatarUrl || null
        } else if (userMatch) {
          targetUsername = userMatch[1]
        }
      }

      return {
        reportId: r.id,
        reason: r.reason || 'İçerik bildirimi',
        createdAt: r.created_at,
        reporterId: r.reporter_id,
        reporterUsername: reporterMap[r.reporter_id] || 'Bilinmiyor',
        targetUserId,
        targetUsername,
        targetUserAvatar,
        post: p ? {
          id: p.id,
          title: p.title || 'Başlıksız Oylama',
          description: p.description,
          image_a_url: p.image_a_url,
          image_b_url: p.image_b_url,
          created_at: p.created_at,
          authorId: p.user_id,
          authorUsername: author?.username || 'kullanici',
          authorName: author?.full_name,
          authorAvatar: author?.avatar_url,
        } : null,
      }
    })
  } catch (err) {
    console.warn('getReportedPosts error:', err)
    return []
  }
}

async function logAdminAction(adminUserId: string, reason: string): Promise<void> {
  try {
    const { error } = await supabase.from('reports').insert({
      reporter_id: adminUserId,
      reason,
    })
    if (!error) return

    const { data: anyPost } = await supabase.from('posts').select('id').limit(1).maybeSingle()
    if (anyPost?.id) {
      await supabase.from('reports').insert({
        reporter_id: adminUserId,
        post_id: anyPost.id,
        reason,
      })
    }
  } catch (err) {
    console.warn('logAdminAction error:', err)
  }
}

export async function getAllUsersForAdmin(): Promise<AdminUserItem[]> {
  try {
    const [profilesRes, reportsRes, localAdmins, localRevoked, localBanned] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('reports').select('reason, created_at').like('reason', 'ADMIN_ACTION:%').order('created_at', { ascending: true }),
      getLocallyPromotedAdmins(),
      getLocallyRevokedAdmins(),
      getLocallyBannedUsers(),
    ])

    const profiles = profilesRes.data || []
    const adminEvents = reportsRes.data || []

    const bannedUsers = new Set<string>(localBanned)
    const promotedAdmins = new Set<string>(localAdmins)
    const revokedAdmins = new Set<string>(localRevoked)

    for (const ev of adminEvents) {
      const r = ev.reason
      if (r.startsWith('ADMIN_ACTION:BAN_USER:')) {
        const uid = r.split(':')[2]
        if (uid) bannedUsers.add(uid)
      } else if (r.startsWith('ADMIN_ACTION:UNBAN_USER:')) {
        const uid = r.split(':')[2]
        if (uid) bannedUsers.delete(uid)
      } else if (r.startsWith('ADMIN_ACTION:PROMOTE_ADMIN:')) {
        const uid = r.split(':')[2]
        if (uid) {
          promotedAdmins.add(uid)
          revokedAdmins.delete(uid)
        }
      } else if (r.startsWith('ADMIN_ACTION:REVOKE_ADMIN:')) {
        const uid = r.split(':')[2]
        if (uid) {
          revokedAdmins.add(uid)
          promotedAdmins.delete(uid)
        }
      }
    }

    // Yerel önbellekteki aksiyonları en yüksek öncelikle zorla
    for (const revId of localRevoked) {
      revokedAdmins.add(revId)
      promotedAdmins.delete(revId)
    }
    for (const admId of localAdmins) {
      if (!revokedAdmins.has(admId)) {
        promotedAdmins.add(admId)
      }
    }
    for (const bId of localBanned) {
      bannedUsers.add(bId)
    }

    return profiles.map(p => {
      const cleanUser = (p.username || '').toLowerCase().replace('@', '').trim()
      const cleanEmail = (p.email || '').toLowerCase().trim()
      const isSuper = isSuperAdminUser(cleanUser) || isSuperAdminUser(cleanEmail)
      
      const isRevoked = revokedAdmins.has(p.id) || localRevoked.has(p.id)
      const isDynamicAdmin = !isSuper && !isRevoked && (promotedAdmins.has(p.id) || p.role === 'admin')
      const isBanned = !isSuper && (bannedUsers.has(p.id) || localBanned.has(p.id) || p.role === 'banned')

      return {
        id: p.id,
        username: p.username || 'isimsiz',
        fullName: p.full_name,
        avatarUrl: p.avatar_url,
        email: p.email,
        createdAt: p.created_at,
        isAdmin: isSuper || isDynamicAdmin,
        isBanned: isBanned,
        isSuperAdmin: isSuper,
      }
    })
  } catch (err) {
    console.warn('getAllUsersForAdmin error:', err)
    return []
  }
}

export async function adminDeletePost(postId: string, adminUserId: string): Promise<boolean> {
  try {
    await supabase.from('posts').update({ is_active: false }).eq('id', postId)
    try {
      await supabase.from('posts').delete().eq('id', postId)
    } catch {}

    await logAdminAction(adminUserId, `ADMIN_ACTION:DELETE_POST:${postId}`)

    return true
  } catch (err) {
    console.warn('adminDeletePost error:', err)
    return false
  }
}

export async function adminBanUser(
  targetUserId: string,
  targetUsername: string,
  adminUserId: string
): Promise<boolean> {
  try {
    const cleanUser = targetUsername.toLowerCase().replace('@', '').trim()
    if (isSuperAdminUser(cleanUser)) {
      console.warn('Ana kurucu yönetici banlanamaz.')
      return false
    }

    // 1. Yerel önbellek: Ban listesine ekle, adminlikten çıkar
    await addLocallyBannedUser(targetUserId)
    await removeLocallyPromotedAdmin(targetUserId)
    await addLocallyRevokedAdmin(targetUserId)

    // 2. RPC ile veritabanı rolünü güncelle
    try {
      await supabase.rpc('admin_set_user_role', {
        target_user_id: targetUserId,
        new_role: 'banned',
      })
    } catch {}

    // 3. Profiles tablosunda role = 'banned' yap
    try {
      await supabase.from('profiles').update({ role: 'banned' }).eq('id', targetUserId)
    } catch {}

    // 4. Gönderilerini inaktif yap
    try {
      await supabase.from('posts').update({ is_active: false }).eq('user_id', targetUserId)
    } catch {}

    // 5. Denetim loguna ban kaydı ekle
    await logAdminAction(adminUserId, `ADMIN_ACTION:BAN_USER:${targetUserId}:@${cleanUser}`)

    // 6. Blocked users tablosuna da ekle
    try {
      await supabase.from('blocked_users').insert({
        blocker_id: adminUserId,
        blocked_id: targetUserId,
      })
    } catch {}

    return true
  } catch (err) {
    console.warn('adminBanUser error:', err)
    return false
  }
}

export async function adminUnbanUser(
  targetUserId: string,
  targetUsername: string,
  adminUserId: string
): Promise<boolean> {
  try {
    const cleanUser = targetUsername.toLowerCase().replace('@', '').trim()

    // 1. Yerel önbellekten ban kaydını sil
    await removeLocallyBannedUser(targetUserId)

    // 2. RPC ile rolü 'user' yap
    try {
      await supabase.rpc('admin_set_user_role', {
        target_user_id: targetUserId,
        new_role: 'user',
      })
    } catch {}

    // 3. Profiles tablosunda role = 'user' yap
    try {
      await supabase.from('profiles').update({ role: 'user' }).eq('id', targetUserId)
    } catch {}

    // 4. Denetim loguna unban kaydı ekle
    await logAdminAction(adminUserId, `ADMIN_ACTION:UNBAN_USER:${targetUserId}:@${cleanUser}`)

    // 5. Blocked users tablosundan çıkar
    try {
      await supabase.from('blocked_users').delete().eq('blocker_id', adminUserId).eq('blocked_id', targetUserId)
    } catch {}

    return true
  } catch (err) {
    console.warn('adminUnbanUser error:', err)
    return false
  }
}

export async function adminPromoteUser(
  targetUserId: string,
  targetUsername: string,
  adminUserId: string
): Promise<boolean> {
  try {
    const cleanUser = targetUsername.toLowerCase().replace('@', '').trim()

    // 1. Yerel önbellekte revoked'dan çıkar, promoted'e ekle
    await removeLocallyRevokedAdmin(targetUserId)
    await addLocallyPromotedAdmin(targetUserId)

    // 2. Eski yetki kaldırma rapor kayıtlarını temizle
    try {
      await supabase.from('reports').delete().like('reason', `ADMIN_ACTION:REVOKE_ADMIN:${targetUserId}%`)
    } catch {}

    // 3. Supabase RPC ile veritabanında role = 'admin' yap
    try {
      await supabase.rpc('admin_set_user_role', {
        target_user_id: targetUserId,
        new_role: 'admin',
      })
    } catch (e) {
      console.warn('admin_set_user_role rpc error:', e)
    }

    // 4. Profiles tablosunda role = 'admin' yapmayı dene
    try {
      await supabase.from('profiles').update({ role: 'admin' }).eq('id', targetUserId)
    } catch (e) {
      console.warn('profiles update role admin error:', e)
    }

    // 5. Denetim loguna kaydet
    await logAdminAction(adminUserId, `ADMIN_ACTION:PROMOTE_ADMIN:${targetUserId}:@${cleanUser}`)

    return true
  } catch (err) {
    console.warn('adminPromoteUser error:', err)
    return false
  }
}

export async function adminRevokeUser(
  targetUserId: string,
  targetUsername: string,
  adminUserId: string
): Promise<boolean> {
  try {
    const cleanUser = targetUsername.toLowerCase().replace('@', '').trim()
    if (isSuperAdminUser(cleanUser)) {
      console.warn('Ana kurucu yöneticinin yetkisi kaldırılamaz.')
      return false
    }

    // 1. Yerel önbellek: Promoted listesinden çıkar, Revoked listesine derhal ekle
    await removeLocallyPromotedAdmin(targetUserId)
    await addLocallyRevokedAdmin(targetUserId)

    // 2. Eski promote rapor kayıtlarını veritabanından tamamen sil
    try {
      await supabase.from('reports').delete().like('reason', `ADMIN_ACTION:PROMOTE_ADMIN:${targetUserId}%`)
    } catch (e) {
      console.warn('reports delete old promote error:', e)
    }

    // 3. RPC ile role = 'user' yap
    try {
      await supabase.rpc('admin_set_user_role', {
        target_user_id: targetUserId,
        new_role: 'user',
      })
    } catch (e) {
      console.warn('admin_set_user_role rpc error:', e)
    }

    // 4. Profiles tablosunda role = 'user' güncelle
    try {
      await supabase.from('profiles').update({ role: 'user' }).eq('id', targetUserId)
    } catch (e) {
      console.warn('profiles update role user error:', e)
    }

    // 5. Denetim loguna yetki kaldırma kaydı ekle
    await logAdminAction(adminUserId, `ADMIN_ACTION:REVOKE_ADMIN:${targetUserId}:@${cleanUser}`)

    return true
  } catch (err) {
    console.warn('adminRevokeUser error:', err)
    return false
  }
}

export async function adminDismissReport(reportId: string): Promise<boolean> {
  try {
    await supabase.from('reports').delete().eq('id', reportId)
    return true
  } catch (err) {
    console.warn('adminDismissReport error:', err)
    return false
  }
}

export async function adminSeedBots(): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Sıralı 12'şer yükleyen yeni RPC fonksiyonunu çağır (240 Bot Havuzu)
    const { data, error } = await supabase.rpc('seed_next_bot_batch', { p_batch_size: 12 })
    if (!error && data) {
      return { success: true, message: data }
    }

    // 2. Yedek olarak eski alias'ı dene
    const { data: aliasData, error: aliasErr } = await supabase.rpc('seed_bots_and_posts')
    if (!aliasErr && aliasData) {
      return { success: true, message: aliasData }
    }

    throw error || aliasErr || new Error('Bot yükleme fonksiyonu çağrılamadı.')
  } catch (err: any) {
    console.warn('adminSeedBots error:', err)
    return { success: false, message: err?.message || 'İşlem başarısız.' }
  }
}

export async function adminClearBots(): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc('clear_all_bots')
    if (error) throw error
    return { success: true, message: data || 'Tüm botlar ve bot verileri başarıyla temizlendi.' }
  } catch (err: any) {
    console.warn('adminClearBots error:', err)
    return { success: false, message: err?.message || 'Silme işlemi başarısız.' }
  }
}


