import React, { useState, useEffect, useMemo } from 'react'
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
  adminSeedBots,
  adminClearBots,
  isSuperAdminUser,
  SUPER_ADMIN_USERNAMES,
  AdminKPIs,
  ReportedPostItem,
  AdminUserItem,
} from '../lib/admin'
import { Theme } from '../lib/theme'

const { width } = Dimensions.get('window')

export default function AdminScreen() {
  const router = useRouter()
  const { session, theme, t } = useApp()
  const s = useMemo(() => createStyles(theme), [theme])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(false)
  const [activeTab, setActiveTab] = useState<'reports' | 'users'>('reports')

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
  const [isSeeding, setIsSeeding] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  const currentUsername = (session?.user?.user_metadata?.username || '').toLowerCase().replace('@', '').trim()
  const currentEmail = (session?.user?.email || '').toLowerCase().trim()
  const isCurrentUserSuperAdmin = isSuperAdminUser(currentUsername) || isSuperAdminUser(currentEmail)

  useEffect(() => {
    verifyAndLoad()
  }, [])

  async function verifyAndLoad() {
    setLoading(true)
    const username = session?.user?.user_metadata?.username
    const email = session?.user?.email
    const isAuthorized = await checkIsAdmin(username, null, session?.user?.id, email)

    if (!isAuthorized) {
      setIsAdminAuthorized(false)
      setLoading(false)
      Alert.alert(
        t('admin.unauthorizedTitle'),
        t('admin.unauthorizedMsg'),
        [{ text: t('common.ok'), onPress: () => router.back() }]
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

  function handleDeleteReportedPost(item: ReportedPostItem) {
    if (!item.post) return
    Alert.alert(
      t('admin.deletePostConfirmTitle'),
      t('admin.deletePostConfirmMsg', { title: item.post.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.deletePostBtn'),
          style: 'destructive',
          onPress: async () => {
            const ok = await adminDeletePost(item.post!.id, session!.user.id)
            if (ok) {
              await adminDismissReport(item.reportId)
              Alert.alert(t('common.success'), t('admin.deleteSuccessMsg'))
              await loadData()
            } else {
              Alert.alert(t('common.error'), t('admin.deleteErrorMsg'))
            }
          },
        },
      ]
    )
  }

  function handleBanReportedUser(item: ReportedPostItem) {
    if (!item.post) return
    const authorUser = item.post.authorUsername.toLowerCase().replace('@', '').trim()
    if (isSuperAdminUser(authorUser)) {
      Alert.alert(t('admin.unauthorizedActionTitle'), t('admin.cannotBanSuperAdmin'))
      return
    }

    Alert.alert(
      t('admin.banUserConfirmTitle'),
      t('admin.banUserConfirmMsg', { username: item.post.authorUsername }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.banUserBtn'),
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
              Alert.alert(t('common.success'), t('admin.banSuccessMsg', { username: item.post!.authorUsername }))
              await loadData()
            } else {
              Alert.alert(t('common.error'), t('admin.banErrorMsg'))
            }
          },
        },
      ]
    )
  }

  function handleDismissReport(item: ReportedPostItem) {
    Alert.alert(
      t('admin.dismissReportConfirmTitle'),
      t('admin.dismissReportConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.dismissBtn'),
          onPress: async () => {
            await adminDismissReport(item.reportId)
            Alert.alert(t('common.success'), t('admin.dismissSuccessMsg'))
            await loadData()
          },
        },
      ]
    )
  }

  function handleUserPress(targetUser: AdminUserItem) {
    if (targetUser.isSuperAdmin) {
      Alert.alert(t('admin.superAdminAlertTitle'), t('admin.superAdminAlertMsg', { username: targetUser.username }))
      return
    }

    if (!isCurrentUserSuperAdmin && targetUser.isAdmin) {
      Alert.alert(t('admin.unauthorizedActionTitle'), t('admin.unauthorizedActionMsg', { username: targetUser.username }))
      return
    }

    const options: { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: t('common.cancel'), style: 'cancel' },
    ]

    // Yönetici Rolü Atama / Kaldırma (Her zaman erişilebilir)
    if (targetUser.isAdmin) {
      options.push({
        text: t('admin.revokeAdmin'),
        style: 'destructive',
        onPress: async () => {
          const ok = await adminRevokeUser(targetUser.id, targetUser.username, session!.user.id)
          if (ok) {
            Alert.alert(t('common.success'), t('admin.revokeAdminSuccess', { username: targetUser.username }))
            await loadData()
          } else {
            Alert.alert(t('common.error'), t('admin.revokeAdminError'))
          }
        },
      })
    } else {
      options.push({
        text: t('admin.makeAdmin'),
        onPress: async () => {
          const ok = await adminPromoteUser(targetUser.id, targetUser.username, session!.user.id)
          if (ok) {
            Alert.alert(t('common.success'), t('admin.makeAdminSuccess', { username: targetUser.username }))
            await loadData()
          } else {
            Alert.alert(t('common.error'), t('admin.makeAdminError'))
          }
        },
      })
    }

    if (targetUser.isBanned) {
      options.push({
        text: t('admin.unbanUser'),
        onPress: async () => {
          const ok = await adminUnbanUser(targetUser.id, targetUser.username, session!.user.id)
          if (ok) {
            Alert.alert(t('common.success'), t('admin.unbanSuccess', { username: targetUser.username }))
            await loadData()
          } else {
            Alert.alert(t('common.error'), t('admin.unbanError'))
          }
        },
      })
    } else {
      options.push({
        text: t('admin.banUserSuspend'),
        style: 'destructive',
        onPress: async () => {
          const ok = await adminBanUser(targetUser.id, targetUser.username, session!.user.id)
          if (ok) {
            Alert.alert(t('common.success'), t('admin.bannedSuccess', { username: targetUser.username }))
            await loadData()
          } else {
            Alert.alert(t('common.error'), t('admin.bannedError'))
          }
        },
      })
    }

    Alert.alert(`@${targetUser.username}`, t('admin.userActionPrompt'), options)
  }

  async function handleSeedBots() {
    Alert.alert(
      t('admin.seedConfirmTitle'),
      t('admin.seedConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.ok'),
          style: 'default',
          onPress: async () => {
            setIsSeeding(true)
            const res = await adminSeedBots()
            setIsSeeding(false)
            if (res.success) {
              Alert.alert(t('common.success'), res.message)
              await loadData()
            } else {
              Alert.alert(
                t('common.error'),
                t('admin.seedInstallTip') + res.message
              )
            }
          },
        },
      ]
    )
  }

  async function handleClearBots() {
    Alert.alert(
      t('admin.clearConfirmTitle'),
      t('admin.clearConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.ok'),
          style: 'destructive',
          onPress: async () => {
            setIsClearing(true)
            const res = await adminClearBots()
            setIsClearing(false)
            if (res.success) {
              Alert.alert(t('common.success'), res.message)
              await loadData()
            } else {
              Alert.alert(
                t('common.error'),
                t('admin.clearInstallTip') + res.message
              )
            }
          },
        },
      ]
    )
  }

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
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={{ color: theme.textSub, marginTop: 12, fontSize: 14 }}>{t('admin.loading')}</Text>
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
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => {
            if (router.canGoBack()) {
              router.back()
            } else {
              router.replace('/(tabs)/profile')
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.headerTitle}>{t('admin.panelTitle')}</Text>
            <View style={s.adminBadge}>
              <Text style={s.adminBadgeText}>{t('admin.adminBadge')}</Text>
            </View>
          </View>
          <Text style={s.headerSub}>{t('admin.panelSub')}</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={handleRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh" size={18} color={theme.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} />}
      >
        {/* KPI Metrics Dashboard Cards */}
        <View style={s.kpiGrid}>
          <View style={s.kpiCard}>
            <View style={s.kpiIconBox}>
              <Ionicons name="people-outline" size={18} color={theme.accent} />
            </View>
            <Text style={s.kpiNumber}>{kpis.totalUsers}</Text>
            <Text style={s.kpiLabel}>{t('admin.totalUsers')}</Text>
          </View>

          <View style={s.kpiCard}>
            <View style={s.kpiIconBox}>
              <Ionicons name="images-outline" size={18} color={theme.accent} />
            </View>
            <Text style={s.kpiNumber}>{kpis.totalPosts}</Text>
            <Text style={s.kpiLabel}>{t('admin.activePolls')}</Text>
          </View>

          <View style={s.kpiCard}>
            <View style={s.kpiIconBox}>
              <Ionicons name="stats-chart-outline" size={18} color={theme.accent} />
            </View>
            <Text style={s.kpiNumber}>{kpis.totalVotes}</Text>
            <Text style={s.kpiLabel}>{t('admin.totalVotes')}</Text>
          </View>

          <View style={[s.kpiCard, kpis.pendingReports > 0 && { borderColor: '#f43f5e' }]}>
            <View style={[s.kpiIconBox, { backgroundColor: kpis.pendingReports > 0 ? '#f43f5e25' : theme.accentLight }]}>
              <Ionicons
                name={kpis.pendingReports > 0 ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                size={18}
                color={kpis.pendingReports > 0 ? '#f43f5e' : '#22c55e'}
              />
            </View>
            <Text style={[s.kpiNumber, kpis.pendingReports > 0 && { color: '#f43f5e' }]}>
              {kpis.pendingReports}
            </Text>
            <Text style={s.kpiLabel}>{t('admin.pendingReports')}</Text>
          </View>
        </View>

        {/* Hızlı İşlem: Bot & İçerik Basma / Silme */}
        <View style={s.actionSection}>
          <TouchableOpacity
            style={s.seedBtn}
            onPress={handleSeedBots}
            disabled={isSeeding || isClearing}
            activeOpacity={0.8}
          >
            {isSeeding ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="cloud-upload-outline" size={18} color="#ffffff" />
            )}
            <Text style={s.seedBtnText}>
              {isSeeding ? t('admin.seeding') : t('admin.seedBtn')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.clearBtn}
            onPress={handleClearBots}
            disabled={isSeeding || isClearing}
            activeOpacity={0.8}
          >
            {isClearing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="trash-outline" size={18} color="#f43f5e" />
            )}
            <Text style={s.clearBtnText}>
              {isClearing ? t('admin.clearing') : t('admin.clearBtn')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Navigation */}
        <View style={s.tabSwitcher}>
          <TouchableOpacity
            style={[s.tabBtn, activeTab === 'reports' && s.tabBtnActive]}
            onPress={() => setActiveTab('reports')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="shield-outline"
              size={15}
              color={activeTab === 'reports' ? '#ffffff' : theme.textSub}
            />
            <Text style={[s.tabBtnText, activeTab === 'reports' && s.tabBtnTextActive]}>
              {t('admin.tabReports', { count: reports.length })}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabBtn, activeTab === 'users' && s.tabBtnActive]}
            onPress={() => setActiveTab('users')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="people-outline"
              size={15}
              color={activeTab === 'users' ? '#ffffff' : theme.textSub}
            />
            <Text style={[s.tabBtnText, activeTab === 'users' && s.tabBtnTextActive]}>
              {t('admin.tabUsers', { count: users.length })}
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB 1: ŞİKAYETLER & RAPORLAR */}
        {activeTab === 'reports' && (
          <View style={s.tabContent}>
            {reports.length === 0 ? (
              <View style={s.emptyBox}>
                <Ionicons name="shield-checkmark-outline" size={48} color="#22c55e" />
                <Text style={s.emptyTitle}>{t('admin.cleanCommunityTitle')}</Text>
                <Text style={s.emptySub}>
                  {t('admin.cleanCommunitySub')}
                </Text>
              </View>
            ) : (
              reports.map((item) => (
                <View key={item.reportId} style={s.reportCard}>
                  {/* Rapor Bilgisi */}
                  <View style={s.reportHeader}>
                    <View style={s.reportBadge}>
                      <Ionicons name="alert-circle-outline" size={13} color="#f43f5e" />
                      <Text style={s.reportBadgeText}>{t('admin.reportBadge')}</Text>
                    </View>
                    <Text style={s.reportDate}>
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>

                  <Text style={s.reportReason}>
                    <Text style={{ fontWeight: '700', color: theme.text }}>{t('admin.reasonLabel')} </Text>
                    {item.reason}
                  </Text>
                  <Text style={s.reporterInfo}>
                    {t('admin.reporterLabel')} <Text style={{ color: theme.accent }}>@{item.reporterUsername}</Text>
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
                          <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13 }}>
                            @{item.post.authorUsername}
                          </Text>
                          <Text style={{ color: theme.textSub, fontSize: 11 }}>
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
                      <Text style={{ color: theme.textSub, fontSize: 12, fontStyle: 'italic' }}>
                        {t('admin.postDeletedOrNotFound')}
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
                          <Ionicons name="trash-outline" size={14} color="#ffffff" />
                          <Text style={s.actionBtnText}>{t('admin.deletePostBtn')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[s.actionBtn, s.banBtn]}
                          onPress={() => handleBanReportedUser(item)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="ban-outline" size={14} color="#ffffff" />
                          <Text style={s.actionBtnText}>{t('admin.banUserBtn')}</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    <TouchableOpacity
                      style={[s.actionBtn, s.dismissBtn]}
                      onPress={() => handleDismissReport(item)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark-outline" size={14} color={theme.textSub} />
                      <Text style={[s.actionBtnText, { color: theme.textSub }]}>{t('admin.dismissBtn')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 2: KULLANICI YÖNETİMİ & BAN */}
        {activeTab === 'users' && (
          <View style={s.tabContent}>
            {/* Arama Barı */}
            <View style={s.searchContainer}>
              <Ionicons name="search-outline" size={16} color={theme.textSub} style={{ marginLeft: 12 }} />
              <TextInput
                style={s.searchInput}
                placeholder={t('admin.searchPlaceholder')}
                placeholderTextColor={theme.textSub}
                value={userSearch}
                onChangeText={setUserSearch}
                autoCapitalize="none"
              />
              {userSearch ? (
                <TouchableOpacity onPress={() => setUserSearch('')} style={{ padding: 8 }}>
                  <Ionicons name="close-circle" size={16} color={theme.textSub} />
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
                  {t('admin.filterAll', { count: users.length })}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.filterChip, userFilter === 'admins' && s.filterChipActive]}
                onPress={() => setUserFilter('admins')}
              >
                <Text style={[s.filterChipText, userFilter === 'admins' && s.filterChipTextActive]}>
                  {t('admin.filterAdmins', { count: users.filter(u => u.isAdmin).length })}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.filterChip, userFilter === 'banned' && s.filterChipActive]}
                onPress={() => setUserFilter('banned')}
              >
                <Text style={[s.filterChipText, userFilter === 'banned' && s.filterChipTextActive]}>
                  {t('admin.filterBanned', { count: users.filter(u => u.isBanned).length })}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Kullanıcı Listesi */}
            {filteredUsers.length === 0 ? (
              <View style={s.emptyBox}>
                <Ionicons name="person-outline" size={44} color={theme.textSub} />
                <Text style={s.emptyTitle}>{t('admin.userNotFoundTitle')}</Text>
                <Text style={s.emptySub}>{t('admin.userNotFoundSub')}</Text>
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
                          <Text style={[s.roleBadgeText, { color: '#fbbf24' }]}>{t('admin.superAdminBadge')}</Text>
                        </View>
                      )}

                      {!u.isSuperAdmin && u.isAdmin && (
                        <View style={[s.roleBadge, { backgroundColor: theme.accentLight, borderColor: theme.accent }]}>
                          <Text style={[s.roleBadgeText, { color: theme.accent }]}>{t('admin.adminRoleBadge')}</Text>
                        </View>
                      )}

                      {u.isBanned && (
                        <View style={[s.roleBadge, { backgroundColor: '#f43f5e25', borderColor: '#f43f5e' }]}>
                          <Text style={[s.roleBadgeText, { color: '#f43f5e' }]}>{t('admin.bannedRoleBadge')}</Text>
                        </View>
                      )}
                    </View>

                    {u.fullName ? (
                      <Text style={s.userFullName} numberOfLines={1}>{u.fullName}</Text>
                    ) : null}

                    <Text style={s.userJoined}>
                      {t('admin.registered')} {new Date(u.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'center', justifyContent: 'center', paddingLeft: 8 }}>
                    <Ionicons name="ellipsis-vertical" size={16} color={theme.textSub} />
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

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
      backgroundColor: theme.card,
      gap: 12,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.text,
    },
    adminBadge: {
      backgroundColor: theme.accentLight,
      borderColor: theme.accent,
      borderWidth: 1,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    adminBadgeText: {
      color: theme.accent,
      fontSize: 10,
      fontWeight: '800',
    },
    headerSub: {
      fontSize: 11,
      color: theme.textSub,
      marginTop: 2,
    },
    refreshBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.accentLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {
      flex: 1,
    },
    kpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      padding: 14,
      gap: 10,
    },
    kpiCard: {
      width: (width - 38) / 2,
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 14,
      borderWidth: 0.8,
      borderColor: theme.border,
    },
    kpiIconBox: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: theme.accentLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    kpiNumber: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.text,
    },
    kpiLabel: {
      fontSize: 11,
      color: theme.textSub,
      marginTop: 4,
      fontWeight: '500',
    },
    tabSwitcher: {
      flexDirection: 'row',
      marginHorizontal: 14,
      marginBottom: 14,
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 4,
      borderWidth: 0.5,
      borderColor: theme.border,
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
      backgroundColor: theme.accent,
    },
    tabBtnText: {
      color: theme.textSub,
      fontSize: 12,
      fontWeight: '600',
    },
    tabBtnTextActive: {
      color: '#ffffff',
    },
    tabContent: {
      paddingHorizontal: 14,
    },
    emptyBox: {
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 32,
      alignItems: 'center',
      borderWidth: 0.5,
      borderColor: theme.border,
      marginTop: 10,
    },
    emptyTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
      marginTop: 14,
    },
    emptySub: {
      color: theme.textSub,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 18,
    },
    reportCard: {
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: '#f43f5e35',
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
      backgroundColor: '#f43f5e20',
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
      color: theme.textSub,
      fontSize: 11,
    },
    reportReason: {
      color: theme.text,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 4,
    },
    reporterInfo: {
      color: theme.textSub,
      fontSize: 11,
      marginBottom: 10,
    },
    reportedPostBox: {
      backgroundColor: theme.bg,
      borderRadius: 12,
      padding: 10,
      marginBottom: 12,
      borderWidth: 0.5,
      borderColor: theme.border,
    },
    reportedPostDeleted: {
      backgroundColor: theme.bg,
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
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    postThumbnail: {
      width: 70,
      height: 90,
      borderRadius: 8,
      backgroundColor: theme.border,
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
      backgroundColor: '#9333ea',
    },
    dismissBtn: {
      backgroundColor: theme.accentLight,
      flex: 0.7,
    },
    actionBtnText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '600',
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 12,
      borderWidth: 0.5,
      borderColor: theme.border,
      marginBottom: 10,
    },
    searchInput: {
      flex: 1,
      color: theme.text,
      paddingVertical: 9,
      paddingHorizontal: 10,
      fontSize: 13,
    },
    filterRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    filterChip: {
      backgroundColor: theme.card,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 0.5,
      borderColor: theme.border,
    },
    filterChipActive: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    filterChipText: {
      color: theme.textSub,
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
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 12,
      marginBottom: 8,
      borderWidth: 0.5,
      borderColor: theme.border,
    },
    userAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
    },
    userAvatarPlaceholder: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    userName: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
    },
    userFullName: {
      color: theme.textSub,
      fontSize: 11,
      marginTop: 2,
    },
    userJoined: {
      color: theme.textSub,
      fontSize: 10,
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
    actionSection: {
      marginHorizontal: 14,
      marginBottom: 14,
    },
    seedBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accent,
      paddingVertical: 13,
      paddingHorizontal: 20,
      borderRadius: 14,
      gap: 8,
    },
    seedBtnText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '700',
    },
    clearBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
      paddingVertical: 11,
      paddingHorizontal: 20,
      borderRadius: 14,
      gap: 8,
      borderWidth: 1,
      borderColor: '#f43f5e40',
      marginTop: 8,
    },
    clearBtnText: {
      color: '#f43f5e',
      fontSize: 12,
      fontWeight: '700',
    },
  })
}
