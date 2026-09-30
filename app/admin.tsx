import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
  Dimensions,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useApp } from '../context/AppContext'
import {
  checkIsAdmin,
  getAdminKPIs,
  getReportedPosts,
  getAllUsersForAdmin,
  adminDeletePost,
  adminBanUser,
  adminUnbanUser,
  adminPromoteUser,
  adminRevokeUser,
  adminDismissReport,
  AdminKPIs,
  ReportedPostItem,
  AdminUserItem,
} from '../lib/admin'

const { width } = Dimensions.get('window')

export default function AdminScreen() {
  const router = useRouter()
  const { session, theme } = useApp()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(false)

  // Tabs: 'reports' | 'users' | 'posts'
  const [activeTab, setActiveTab] = useState<'reports' | 'users'>('reports')

  // Data states
  const [kpis, setKpis] = useState<AdminKPIs>({
    totalUsers: 0,
    totalPosts: 0,
    totalVotes: 0,
    pendingReports: 0,
    bannedCount: 0,
  })
  const [reports, setReports] = useState<ReportedPostItem[]>([])
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [userFilter, setUserFilter] = useState<'all' | 'admins' | 'banned'>('all')

  useEffect(() => {
    verifyAndLoad()
  }, [])

  async function verifyAndLoad() {
    setLoading(true)
    const username = session?.user?.user_metadata?.username
    const isAuthorized = await checkIsAdmin(username, null, session?.user?.id)

    if (!isAuthorized) {
      setIsAdminAuthorized(false)
      setLoading(false)
      Alert.alert(
        'Yetkisiz Erişim',
        'Bu sayfaya yalnızca sistem yöneticileri erişebilir.',
        [{ text: 'Tamam', onPress: () => router.back() }]
      )
      return
    }

    setIsAdminAuthorized(true)
    await loadData()
    setLoading(false)
  }

  async function loadData() {
    try {
      const [kpiData, reportsData, usersData] = await Promise.all([
        getAdminKPIs(),
        getReportedPosts(),
        getAllUsersForAdmin(),
      ])
      setKpis(kpiData)
      setReports(reportsData)
      setUsers(usersData)
    } catch (err) {
      console.warn('Admin loadData error:', err)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  // ─── Şikayet Aksiyonları ──────────────────────────────────────────
  function handleDeleteReportedPost(item: ReportedPostItem) {
    if (!item.post) return
    Alert.alert(
      'Gönderiyi Sil',
      `"${item.post.title}" başlıklı gönderiyi tüm sistemden silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Evet, Sil',
          style: 'destructive',
          onPress: async () => {
            const ok = await adminDeletePost(item.post!.id, session!.user.id)
            if (ok) {
              await adminDismissReport(item.reportId)
              Alert.alert('Başarılı', 'Gönderi akıştan ve sistemden tamamen kaldırıldı.')
              await loadData()
            } else {
              Alert.alert('Hata', 'Gönderi silinemedi.')
            }
          },
        },
      ]
    )
  }

  function handleBanReportedUser(item: ReportedPostItem) {
    if (!item.post) return
    Alert.alert(
      'Kullanıcıyı Banla',
      `@${item.post.authorUsername} adlı kullanıcıyı banlamak istediğinize emin misiniz? Kullanıcının tüm gönderileri gizlenecek ve oturumu askıya alınacaktır.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kullanıcıyı Banla',
          style: 'destructive',
          onPress: async () => {
            const ok = await adminBanUser(
              item.post!.authorId,
              item.post!.authorUsername,
              session!.user.id
            )
            if (ok) {
              await adminDeletePost(item.post!.id, session!.user.id)
              await adminDismissReport(item.reportId)
              Alert.alert('Kullanıcı Banlandı', `@${item.post.authorUsername} askıya alındı ve içeriği temizlendi.`)
              await loadData()
            } else {
              Alert.alert('Hata', 'Kullanıcı banlanırken aksama oluştu.')
            }
          },
        },
      ]
    )
  }

  function handleDismissReport(item: ReportedPostItem) {
    Alert.alert(
      'Raporu Kapat',
      'Bu şikayeti incelediniz ve içeriğin kurallara uygun olduğuna karar verdiniz mi?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Raporu Kapat',
          onPress: async () => {
            await adminDismissReport(item.reportId)
            Alert.alert('Kapatıldı', 'Şikayet arşive kaldırıldı.')
            await loadData()
          },
        },
      ]
    )
  }

  // ─── Kullanıcı Yönetim Aksiyonları ────────────────────────────────
  function handleUserPress(targetUser: AdminUserItem) {
    if (targetUser.isSuperAdmin) {
      Alert.alert('Süper Yönetici', `@${targetUser.username} kurucu süper yöneticidir, yetkileri değiştirilemez.`)
      return
    }

    const options: { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'İptal', style: 'cancel' },
    ]

    // Admin yap veya adminliği al
    if (targetUser.isAdmin) {
      options.push({
        text: 'Admin Yetkisini Kaldır',
        style: 'destructive',
        onPress: async () => {
          await adminRevokeUser(targetUser.id, targetUser.username, session!.user.id)
          Alert.alert('Güncellendi', `@${targetUser.username} artık yönetici değil.`)
          await loadData()
        },
      })
    } else {
      options.push({
        text: 'Bu Kullanıcıyı Admin Yap',
        onPress: async () => {
          await adminPromoteUser(targetUser.id, targetUser.username, session!.user.id)
          Alert.alert('Yönetici Atandı!', `@${targetUser.username} artık Yönetici yetkilerine sahip.`)
          await loadData()
        },
      })
    }

    // Banla veya Banı kaldır
    if (targetUser.isBanned) {
      options.push({
        text: 'Kullanıcının Banını Kaldır',
        onPress: async () => {
          await adminUnbanUser(targetUser.id, targetUser.username, session!.user.id)
          Alert.alert('Yasak Kaldırıldı', `@${targetUser.username} hesabı tekrar aktif edildi.`)
          await loadData()
        },
      })
    } else {
      options.push({
        text: 'Kullanıcıyı Banla (Askıya Al)',
        style: 'destructive',
        onPress: async () => {
          await adminBanUser(targetUser.id, targetUser.username, session!.user.id)
          Alert.alert('Banlandı', `@${targetUser.username} askıya alındı.`)
          await loadData()
        },
      })
    }

    Alert.alert(`@${targetUser.username}`, 'Bu kullanıcı üzerinde hangi işlemi yapmak istiyorsunuz?', options)
  }

  // Filtrelenmiş kullanıcılar
  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase().replace('@', '').trim()
    const matchesQuery = !q ||
      u.username.toLowerCase().includes(q) ||
      (u.fullName && u.fullName.toLowerCase().includes(q))

    if (!matchesQuery) return false

    if (userFilter === 'admins') return u.isAdmin
    if (userFilter === 'banned') return u.isBanned
    return true
  })

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#a855f7" />
        <Text style={{ color: '#94a3b8', marginTop: 12, fontSize: 14 }}>Yönetici Paneli yükleniyor...</Text>
      </SafeAreaView>
    )
  }

  if (!isAdminAuthorized) {
    return null
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Top Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.headerTitle}>Yönetici Paneli</Text>
            <View style={s.adminBadge}>
              <Text style={s.adminBadgeText}>ADMİN</Text>
            </View>
          </View>
          <Text style={s.headerSub}>Dythin Moderasyon & Canlı Metrikler</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={handleRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh" size={20} color="#c084fc" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#a855f7" />}
      >
        {/* KPI Metrics Dashboard Cards */}
        <View style={s.kpiGrid}>
          <View style={s.kpiCard}>
            <View style={s.kpiIconBox}>
              <Ionicons name="people" size={20} color="#38bdf8" />
            </View>
            <Text style={s.kpiNumber}>{kpis.totalUsers}</Text>
            <Text style={s.kpiLabel}>Toplam Kullanıcı</Text>
          </View>

          <View style={s.kpiCard}>
            <View style={[s.kpiIconBox, { backgroundColor: '#a855f720' }]}>
              <Ionicons name="images" size={20} color="#c084fc" />
            </View>
            <Text style={s.kpiNumber}>{kpis.totalPosts}</Text>
            <Text style={s.kpiLabel}>Aktif Oylama</Text>
          </View>

          <View style={s.kpiCard}>
            <View style={[s.kpiIconBox, { backgroundColor: '#10b98120' }]}>
              <Ionicons name="stats-chart" size={20} color="#34d399" />
            </View>
            <Text style={s.kpiNumber}>{kpis.totalVotes}</Text>
            <Text style={s.kpiLabel}>Toplam Oy</Text>
          </View>

          <View style={[s.kpiCard, kpis.pendingReports > 0 && { borderColor: '#f43f5e' }]}>
            <View style={[s.kpiIconBox, { backgroundColor: kpis.pendingReports > 0 ? '#f43f5e30' : '#22c55e20' }]}>
              <Ionicons
                name={kpis.pendingReports > 0 ? 'warning' : 'checkmark-circle'}
                size={20}
                color={kpis.pendingReports > 0 ? '#f43f5e' : '#22c55e'}
              />
            </View>
            <Text style={[s.kpiNumber, kpis.pendingReports > 0 && { color: '#f43f5e' }]}>
              {kpis.pendingReports}
            </Text>
            <Text style={s.kpiLabel}>Bekleyen Şikayet</Text>
          </View>
        </View>

        {/* Tab Navigation */}
        <View style={s.tabSwitcher}>
          <TouchableOpacity
            style={[s.tabBtn, activeTab === 'reports' && s.tabBtnActive]}
            onPress={() => setActiveTab('reports')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="alert-circle"
              size={16}
              color={activeTab === 'reports' ? '#ffffff' : '#94a3b8'}
            />
            <Text style={[s.tabBtnText, activeTab === 'reports' && s.tabBtnTextActive]}>
              Şikayetler ({reports.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabBtn, activeTab === 'users' && s.tabBtnActive]}
            onPress={() => setActiveTab('users')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="people"
              size={16}
              color={activeTab === 'users' ? '#ffffff' : '#94a3b8'}
            />
            <Text style={[s.tabBtnText, activeTab === 'users' && s.tabBtnTextActive]}>
              Kullanıcı Yönetimi ({users.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─── TAB 1: ŞİKAYETLER & RAPORLAR ───────────────────────────── */}
        {activeTab === 'reports' && (
          <View style={s.tabContent}>
            {reports.length === 0 ? (
              <View style={s.emptyBox}>
                <Ionicons name="shield-checkmark" size={56} color="#22c55e" />
                <Text style={s.emptyTitle}>Tebrikler, Topluluk Temiz!</Text>
                <Text style={s.emptySub}>
                  Şu anda bekleyen hiçbir uygunsuz içerik veya kullanıcı şikayeti bulunmuyor.
                </Text>
              </View>
            ) : (
              reports.map((item) => (
                <View key={item.reportId} style={s.reportCard}>
                  {/* Rapor Bilgisi */}
                  <View style={s.reportHeader}>
                    <View style={s.reportBadge}>
                      <Ionicons name="warning" size={13} color="#f43f5e" />
                      <Text style={s.reportBadgeText}>ŞİKAYET</Text>
                    </View>
                    <Text style={s.reportDate}>
                      {new Date(item.createdAt).toLocaleDateString('tr-TR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>

                  <Text style={s.reportReason}>
                    <Text style={{ fontWeight: '700', color: '#cbd5e1' }}>Sebep: </Text>
                    {item.reason}
                  </Text>
                  <Text style={s.reporterInfo}>
                    Bildiren: <Text style={{ color: '#c084fc' }}>@{item.reporterUsername}</Text>
                  </Text>

                  {/* Gönderi Önizlemesi */}
                  {item.post ? (
                    <View style={s.reportedPostBox}>
                      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                        {item.post.authorAvatar ? (
                          <Image source={{ uri: item.post.authorAvatar }} style={s.authorAvatar} />
                        ) : (
                          <View style={s.authorAvatarPlaceholder}>
                            <Text style={{ color: '#ffffff', fontWeight: '700' }}>
                              {(item.post.authorUsername || 'D')[0].toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View>
                          <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 13 }}>
                            @{item.post.authorUsername}
                          </Text>
                          <Text style={{ color: '#94a3b8', fontSize: 11 }}>
                            {item.post.title || 'Başlıksız'}
                          </Text>
                        </View>
                      </View>

                      {/* Fotoğraf Thumbnail */}
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        {item.post.image_a_url && (
                          <Image
                            source={{ uri: item.post.image_a_url }}
                            style={s.postThumbnail}
                            resizeMode="cover"
                          />
                        )}
                        {item.post.image_b_url && (
                          <Image
                            source={{ uri: item.post.image_b_url }}
                            style={s.postThumbnail}
                            resizeMode="cover"
                          />
                        )}
                      </View>
                    </View>
                  ) : (
                    <View style={s.reportedPostDeleted}>
                      <Text style={{ color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }}>
                        Bu gönderi daha önce silinmiş veya bulunamadı.
                      </Text>
                    </View>
                  )}

                  {/* Admin Butonları */}
                  <View style={s.actionRow}>
                    {item.post && (
                      <>
                        <TouchableOpacity
                          style={[s.actionBtn, s.deleteBtn]}
                          onPress={() => handleDeleteReportedPost(item)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="trash" size={15} color="#ffffff" />
                          <Text style={s.actionBtnText}>Gönderiyi Sil</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[s.actionBtn, s.banBtn]}
                          onPress={() => handleBanReportedUser(item)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="ban" size={15} color="#ffffff" />
                          <Text style={s.actionBtnText}>Kullanıcıyı Banla</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    <TouchableOpacity
                      style={[s.actionBtn, s.dismissBtn]}
                      onPress={() => handleDismissReport(item)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark-done" size={15} color="#94a3b8" />
                      <Text style={[s.actionBtnText, { color: '#94a3b8' }]}>Kapat</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ─── TAB 2: KULLANICI YÖNETİMİ & BAN ────────────────────────── */}
        {activeTab === 'users' && (
          <View style={s.tabContent}>
            {/* Arama Barı */}
            <View style={s.searchContainer}>
              <Ionicons name="search" size={18} color="#94a3b8" style={{ marginLeft: 12 }} />
              <TextInput
                style={s.searchInput}
                placeholder="Kullanıcı adı veya isim ile ara..."
                placeholderTextColor="#64748b"
                value={userSearch}
                onChangeText={setUserSearch}
                autoCapitalize="none"
              />
              {userSearch ? (
                <TouchableOpacity onPress={() => setUserSearch('')} style={{ padding: 8 }}>
                  <Ionicons name="close-circle" size={18} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Filtre Butonları */}
            <View style={s.filterRow}>
              <TouchableOpacity
                style={[s.filterChip, userFilter === 'all' && s.filterChipActive]}
                onPress={() => setUserFilter('all')}
              >
                <Text style={[s.filterChipText, userFilter === 'all' && s.filterChipTextActive]}>
                  Tümü ({users.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.filterChip, userFilter === 'admins' && s.filterChipActive]}
                onPress={() => setUserFilter('admins')}
              >
                <Text style={[s.filterChipText, userFilter === 'admins' && s.filterChipTextActive]}>
                  Yöneticiler ({users.filter(u => u.isAdmin).length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.filterChip, userFilter === 'banned' && s.filterChipActive]}
                onPress={() => setUserFilter('banned')}
              >
                <Text style={[s.filterChipText, userFilter === 'banned' && s.filterChipTextActive]}>
                  Banlılar ({users.filter(u => u.isBanned).length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Kullanıcı Listesi */}
            {filteredUsers.length === 0 ? (
              <View style={s.emptyBox}>
                <Ionicons name="person-circle-outline" size={48} color="#64748b" />
                <Text style={s.emptyTitle}>Kullanıcı Bulunamadı</Text>
                <Text style={s.emptySub}>Arama kriterine uygun bir kullanıcı kaydı yok.</Text>
              </View>
            ) : (
              filteredUsers.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={s.userCard}
                  onPress={() => handleUserPress(u)}
                  activeOpacity={0.75}
                >
                  {u.avatarUrl ? (
                    <Image source={{ uri: u.avatarUrl }} style={s.userAvatar} />
                  ) : (
                    <View style={s.userAvatarPlaceholder}>
                      <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>
                        {(u.username || 'D')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.userName} numberOfLines={1}>
                        @{u.username}
                      </Text>

                      {u.isSuperAdmin && (
                        <View style={[s.roleBadge, { backgroundColor: '#f59e0b25', borderColor: '#f59e0b' }]}>
                          <Text style={[s.roleBadgeText, { color: '#fbbf24' }]}>KURUCU</Text>
                        </View>
                      )}

                      {!u.isSuperAdmin && u.isAdmin && (
                        <View style={[s.roleBadge, { backgroundColor: '#a855f725', borderColor: '#a855f7' }]}>
                          <Text style={[s.roleBadgeText, { color: '#c084fc' }]}>ADMİN</Text>
                        </View>
                      )}

                      {u.isBanned && (
                        <View style={[s.roleBadge, { backgroundColor: '#f43f5e25', borderColor: '#f43f5e' }]}>
                          <Text style={[s.roleBadgeText, { color: '#f43f5e' }]}>BANLI</Text>
                        </View>
                      )}
                    </View>

                    {u.fullName ? (
                      <Text style={s.userFullName} numberOfLines={1}>{u.fullName}</Text>
                    ) : null}

                    <Text style={s.userJoined}>
                      Kayıt: {new Date(u.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'center', justifyContent: 'center', paddingLeft: 8 }}>
                    <Ionicons name="ellipsis-vertical" size={18} color="#94a3b8" />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1e1b4b',
    backgroundColor: '#0f0e24',
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1e1b4b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  adminBadge: {
    backgroundColor: '#a855f730',
    borderColor: '#a855f7',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adminBadgeText: {
    color: '#c084fc',
    fontSize: 10,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#a855f715',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },

  // KPI Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 14,
    gap: 10,
  },
  kpiCard: {
    width: (width - 38) / 2,
    backgroundColor: '#13112b',
    borderRadius: 16,
    padding: 14,
    borderWidth: 0.8,
    borderColor: '#262354',
  },
  kpiIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#38bdf820',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  kpiNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
  },
  kpiLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    fontWeight: '500',
  },

  // Tab Switcher
  tabSwitcher: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginBottom: 14,
    backgroundColor: '#13112b',
    borderRadius: 14,
    padding: 4,
    borderWidth: 0.5,
    borderColor: '#262354',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: '#a855f7',
  },
  tabBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#ffffff',
  },
  tabContent: {
    paddingHorizontal: 14,
  },

  // Empty State
  emptyBox: {
    backgroundColor: '#13112b',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#262354',
    marginTop: 10,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 14,
  },
  emptySub: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },

  // Report Card
  reportCard: {
    backgroundColor: '#13112b',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f43f5e40',
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f43f5e25',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  reportBadgeText: {
    color: '#f43f5e',
    fontSize: 10,
    fontWeight: '800',
  },
  reportDate: {
    color: '#64748b',
    fontSize: 11,
  },
  reportReason: {
    color: '#f8fafc',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  reporterInfo: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 10,
  },
  reportedPostBox: {
    backgroundColor: '#0a0a14',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#262354',
  },
  reportedPostDeleted: {
    backgroundColor: '#0a0a14',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  authorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  authorAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#a855f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postThumbnail: {
    width: 70,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#1e1b4b',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
  },
  deleteBtn: {
    backgroundColor: '#dc2626',
  },
  banBtn: {
    backgroundColor: '#7c3aed',
  },
  dismissBtn: {
    backgroundColor: '#1e1b4b',
    flex: 0.7,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Users Tab
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13112b',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#262354',
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    backgroundColor: '#13112b',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 0.5,
    borderColor: '#262354',
  },
  filterChipActive: {
    backgroundColor: '#a855f7',
    borderColor: '#a855f7',
  },
  filterChipText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13112b',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: '#262354',
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#a855f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  userFullName: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 2,
  },
  userJoined: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 3,
  },
  roleBadge: {
    borderWidth: 0.8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
})
