import { supabase } from './supabase'

export const SUPER_ADMIN_USERNAMES = [
  'mehmetkarabul7tt',
  'karabul1',
  'karabul7tt',
  'dythin',
  'dythin.app',
]

export function isSuperAdminUser(username?: string | null): boolean {
  if (!username) return false
  const clean = username.toLowerCase().replace('@', '').trim()
  return SUPER_ADMIN_USERNAMES.includes(clean)
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
  userId?: string | null
): Promise<boolean> {
  if (!username && !userId) return false

  let cleanUser = (username || '').toLowerCase().replace('@', '').trim()

  // 1. Ana yönetici (Super Admin) kontrolü - Yalnızca @mehmetkarabul7tt
  if (cleanUser && SUPER_ADMIN_USERNAMES.includes(cleanUser)) return true

  // 2. Veritabanından profil ve role kontrolü
  if (userId) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, username')
        .eq('id', userId)
        .maybeSingle()

      if (profile) {
        const dbUser = (profile.username || '').toLowerCase().replace('@', '').trim()
        if (dbUser && SUPER_ADMIN_USERNAMES.includes(dbUser)) return true
        if (profile.role === 'admin') return true
        if (dbUser) cleanUser = dbUser
      }
    } catch {}
  }

  if (role === 'admin') return true

  // 3. Mehmet'in admin panelinden yetkilendirdiği kullanıcılar
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

  return false
}

export async function getAdminKPIs(): Promise<AdminKPIs> {
  let totalUsers = 0
  let totalPosts = 0
  let totalVotes = 0
  let pendingReports = 0
  let bannedCount = 0

  try {
    const [uRes, pRes, vRes, rRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('votes').select('id', { count: 'exact', head: true }),
      supabase.from('reports').select('id, reason'),
    ])

    totalUsers = uRes.count || 0
    totalPosts = pRes.count || 0
    totalVotes = vRes.count || 0

    if (rRes.data) {
      pendingReports = rRes.data.filter(r => !r.reason?.startsWith('ADMIN_ACTION:')).length
      const bannedSet = new Set(
        rRes.data
          .filter(r => r.reason?.startsWith('ADMIN_ACTION:BAN_USER:'))
          .map(r => r.reason.split(':')[2])
      )
      bannedCount = bannedSet.size
    }
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

    return userReports.map(r => {
      const p = (r as any).posts
      const author = p?.profiles
      return {
        reportId: r.id,
        reason: r.reason || 'İçerik bildirimi',
        createdAt: r.created_at,
        reporterId: r.reporter_id,
        reporterUsername: reporterMap[r.reporter_id] || 'Bilinmiyor',
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

export async function getAllUsersForAdmin(): Promise<AdminUserItem[]> {
  try {
    const [profilesRes, reportsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('reports').select('reason, created_at').like('reason', 'ADMIN_ACTION:%').order('created_at', { ascending: false }),
    ])

    const profiles = profilesRes.data || []
    const adminEvents = reportsRes.data || []

    const bannedUsers = new Set<string>()
    const unbannedUsers = new Set<string>()
    const promotedAdmins = new Set<string>()
    const revokedAdmins = new Set<string>()

    for (const ev of adminEvents) {
      const r = ev.reason
      if (r.startsWith('ADMIN_ACTION:BAN_USER:')) {
        const uid = r.split(':')[2]
        if (!unbannedUsers.has(uid)) bannedUsers.add(uid)
      } else if (r.startsWith('ADMIN_ACTION:UNBAN_USER:')) {
        const uid = r.split(':')[2]
        unbannedUsers.add(uid)
        bannedUsers.delete(uid)
      } else if (r.startsWith('ADMIN_ACTION:PROMOTE_ADMIN:')) {
        const uid = r.split(':')[2]
        if (!revokedAdmins.has(uid)) promotedAdmins.add(uid)
      } else if (r.startsWith('ADMIN_ACTION:REVOKE_ADMIN:')) {
        const uid = r.split(':')[2]
        revokedAdmins.add(uid)
        promotedAdmins.delete(uid)
      }
    }

    return profiles.map(p => {
      const cleanUser = (p.username || '').toLowerCase()
      const isSuper = SUPER_ADMIN_USERNAMES.includes(cleanUser)
      const isDynamicAdmin = promotedAdmins.has(p.id) || (p.role === 'admin')
      const isBanned = bannedUsers.has(p.id) || (p.role === 'banned')

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

    await supabase.from('reports').insert({
      reporter_id: adminUserId,
      post_id: postId,
      reason: `ADMIN_ACTION:DELETE_POST:${postId}`,
    })

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
    if (SUPER_ADMIN_USERNAMES.includes(cleanUser)) {
      console.warn('Ana yönetici banlanamaz.')
      return false
    }

    try {
      await supabase.rpc('admin_set_user_role', {
        target_user_id: targetUserId,
        new_role: 'banned',
      })
    } catch {}

    try {
      await supabase.from('profiles').update({ role: 'banned' }).eq('id', targetUserId)
    } catch {}

    await supabase.from('posts').update({ is_active: false }).eq('user_id', targetUserId)

    await supabase.from('reports').insert({
      reporter_id: adminUserId,
      reason: `ADMIN_ACTION:BAN_USER:${targetUserId}:@${cleanUser}`,
    })

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

    try {
      await supabase.rpc('admin_set_user_role', {
        target_user_id: targetUserId,
        new_role: 'user',
      })
    } catch {}

    try {
      await supabase.from('profiles').update({ role: 'user' }).eq('id', targetUserId)
    } catch {}

    await supabase.from('reports').insert({
      reporter_id: adminUserId,
      reason: `ADMIN_ACTION:UNBAN_USER:${targetUserId}:@${cleanUser}`,
    })

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

    try {
      await supabase.rpc('admin_set_user_role', {
        target_user_id: targetUserId,
        new_role: 'admin',
      })
    } catch {}

    try {
      await supabase.from('profiles').update({ role: 'admin' }).eq('id', targetUserId)
    } catch {}

    await supabase.from('reports').insert({
      reporter_id: adminUserId,
      reason: `ADMIN_ACTION:PROMOTE_ADMIN:${targetUserId}:@${cleanUser}`,
    })
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
    if (SUPER_ADMIN_USERNAMES.includes(cleanUser)) {
      console.warn('Ana yöneticinin yetkisi kaldırılamaz.')
      return false
    }

    try {
      await supabase.rpc('admin_set_user_role', {
        target_user_id: targetUserId,
        new_role: 'user',
      })
    } catch {}

    try {
      await supabase.from('profiles').update({ role: 'user' }).eq('id', targetUserId)
    } catch {}

    await supabase.from('reports').insert({
      reporter_id: adminUserId,
      reason: `ADMIN_ACTION:REVOKE_ADMIN:${targetUserId}:@${cleanUser}`,
    })
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
    const { data, error } = await supabase.rpc('seed_bots_and_posts')
    if (error) throw error
    return { success: true, message: data || 'Bot verileri başarıyla yüklendi.' }
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


