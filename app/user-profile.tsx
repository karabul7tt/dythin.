import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
  RefreshControl,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { sendPushNotificationToUser } from '../lib/notifications'
import type { Profile, Post, Vote } from '../lib/types'
import ZoomablePhoto from '../components/ZoomablePhoto'
import { isSuperAdminUser, checkIsSuperAdmin, checkIsAdmin, adminPromoteUser, adminRevokeUser, adminBanUser } from '../lib/admin'

const { width: WIN_W, height: WIN_H } = Dimensions.get('window')

export default function UserProfileScreen() {
  const { theme, session, t } = useApp()
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [stats, setStats] = useState({ posts: 0, votes: 0, friends: 0 })
  const [friendshipStatus, setFriendshipStatus] = useState<'accepted' | 'pending' | 'none'>('none')
  const [loading, setLoading] = useState(true)
  const [votingMap, setVotingMap] = useState<{ [postId: string]: boolean }>({})
  const [zoomUri, setZoomUri] = useState<string>('')
  const [zoomMounted, setZoomMounted] = useState(false)

  const openZoom = (uri: string) => {
    setZoomMounted(false)
    setZoomUri('')
    setTimeout(() => {
      setZoomUri(uri)
      setZoomMounted(true)
    }, 80)
  }

  const closeZoom = () => {
    setZoomMounted(false)
    setZoomUri('')
  }

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchUserProfile(), fetchUserPosts(), fetchFriendshipStatus()])
    setLoading(false)
  }

  useEffect(() => {
    if (userId) {
      fetchAll()
    }
  }, [userId])

  async function fetchUserProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) {
      const p = data as Profile
      try {
        const savedPrivate = await AsyncStorage.getItem(`is_private_${userId}`)
        if (savedPrivate !== null && p.is_private === undefined) {
          p.is_private = JSON.parse(savedPrivate)
        }
      } catch {}
      setProfile(p)
    }

    const { count: postCount } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    const { count: voteCount } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('voter_id', userId)

    const { count: friendCount } = await supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)

    setStats({
      posts: postCount || 0,
      votes: voteCount || 0,
      friends: friendCount || 0,
    })
  }

  async function fetchUserPosts() {
    const { data } = await supabase
      .from('posts')
      .select('*, votes(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    setPosts((data as Post[]) || [])
    setLoading(false)
  }

  async function fetchFriendshipStatus() {
    if (!session?.user.id || session.user.id === userId) return

    const { data } = await supabase
      .from('friendships')
      .select('*')
      .or(`and(requester_id.eq.${session.user.id},receiver_id.eq.${userId}),and(requester_id.eq.${userId},receiver_id.eq.${session.user.id})`)
      .maybeSingle()

    if (data) {
      setFriendshipStatus(data.status as 'accepted' | 'pending')
    } else {
      setFriendshipStatus('none')
    }
  }

  async function toggleFriendship() {
    if (!session?.user.id || session.user.id === userId) return

    if (friendshipStatus === 'none') {
      const { error } = await supabase.from('friendships').insert({
        requester_id: session.user.id,
        receiver_id: userId,
      })
      if (!error) {
        setFriendshipStatus('pending')
        Alert.alert('İstek Gönderildi', 'Arkadaşlık isteği başarıyla iletildi.')

        try {
          const { data: myProfile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', session.user.id)
            .single()
          const senderName = myProfile?.username ? `@${myProfile.username}` : 'Biri'
          sendPushNotificationToUser(
            userId,
            'Arkadaşlık İsteği!',
            `${senderName} sana arkadaşlık isteği gönderdi.`
          )
        } catch {}
      }
    } else if (friendshipStatus === 'accepted') {
      Alert.alert('Arkadaşı Çıkar', 'Bu kişiyi arkadaş listenizden çıkarmak istediğinize emin misiniz?', [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkar',
          style: 'destructive',
          onPress: async () => {
            await supabase
              .from('friendships')
              .delete()
              .or(`and(requester_id.eq.${session.user.id},receiver_id.eq.${userId}),and(requester_id.eq.${userId},receiver_id.eq.${session.user.id})`)
            setFriendshipStatus('none')
          },
        },
      ])
    }
  }

  async function handleVoteOnPost(post: Post, option: 'A' | 'B') {
    if (!session?.user.id) return Alert.alert('Hata', 'Giriş yapmalısınız.')
    setVotingMap(prev => ({ ...prev, [post.id]: true }))

    let { error } = await supabase.from('votes').insert({
      post_id: post.id,
      voter_id: session.user.id,
      selected_option: option,
      value: option === 'B',
    })

    if (error && error.code === '42703') {
      const res = await supabase.from('votes').insert({
        post_id: post.id,
        voter_id: session.user.id,
        value: option === 'B',
      })
      error = res.error
    }

    setVotingMap(prev => ({ ...prev, [post.id]: false }))

    if (error) {
      if (error.code === '23505') {
        Alert.alert('Bilgi', 'Bu oylamaya daha önce oy kullandınız.')
      } else {
        Alert.alert('Hata', error.message)
      }
    } else {
      if (post.user_id && post.user_id !== session.user.id) {
        sendPushNotificationToUser(
          post.user_id,
          'Yeni Bir Oyun Var!',
          `"${post.title || 'Fotoğrafın'}" oylandı. Sonuçları görmek için tıkla!`
        ).catch(() => {})
      }
      Alert.alert(
        'Oyunuz Kaydedildi',
        post.image_b_url
          ? (option === 'A' ? 'Soldaki seçeneğe oy verdiniz.' : 'Sağdaki seçeneğe oy verdiniz.')
          : (option === 'B' ? 'Beğendim olarak kaydedildi.' : 'Beğenmedim olarak kaydedildi.')
      )
      fetchUserPosts()
    }
  }

  async function handleProfileModeration() {
    if (!profile || !session?.user.id) return
    const currentUsername = session.user.user_metadata?.username
    const currentEmail = session.user.email
    const amISuperAdmin = await checkIsSuperAdmin(session.user.id, currentUsername, currentEmail)
    const isTargetSuper = isSuperAdminUser(profile.username) || isSuperAdminUser((profile as any).email)
    const isTargetAdmin = await checkIsAdmin(profile.username, (profile as any).role, profile.id, (profile as any).email)

    const buttons: any[] = []

    // 1. Süper Admin Özel Yetkisi: Başka kullanıcıyı admin yapabilir veya adminliğini alabilir
    if (amISuperAdmin && !isTargetSuper) {
      if (isTargetAdmin) {
        buttons.push({
          text: 'Yöneticilik Yetkisini Kaldır',
          style: 'destructive',
          onPress: async () => {
            await adminRevokeUser(profile.id, profile.username, session.user.id)
            Alert.alert('Yetki Kaldırıldı', `@${profile.username} kullanıcısının yöneticilik yetkisi kaldırıldı.`)
          },
        })
      } else {
        buttons.push({
          text: 'Yönetici Olarak Ata',
          onPress: async () => {
            await adminPromoteUser(profile.id, profile.username, session.user.id)
            Alert.alert('Yönetici Atandı', `@${profile.username} artık yönetici. Yönetici paneline erişebilir.`)
          },
        })
      }
    }

    // 2. Bildir seçeneği
    buttons.push({
      text: 'Kullanıcıyı Bildir',
      style: 'destructive',
      onPress: async () => {
        if (posts.length > 0) {
          await supabase.from('reports').insert({
            reporter_id: session?.user.id,
            post_id: posts[0].id,
            reason: `Profil bildirildi: @${profile.username}`,
          })
        }
        Alert.alert(
          'Bildirim Alındı',
          'Şikayetiniz alındı. Sakıncalı kullanıcılar 24 saat içinde incelenir ve kuralları ihlal edenler sistemden kalıcı olarak engellenir.'
        )
      },
    })

    // 3. Engelle seçeneği (Kurucu / Süper admin asla engellenemez)
    if (!isTargetSuper) {
      buttons.push({
        text: 'Kullanıcıyı Engelle',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Kullanıcıyı Engelle',
            `@${profile.username} adlı kullanıcıyı engellemek istediğinize emin misiniz?`,
            [
              { text: 'İptal', style: 'cancel' },
              {
                text: 'Engelle',
                style: 'destructive',
                onPress: async () => {
                  await supabase.from('blocked_users').insert({
                    blocker_id: session?.user.id,
                    blocked_id: profile.id,
                  })
                  if (posts.length > 0) {
                    await supabase.from('reports').insert({
                      reporter_id: session?.user.id,
                      post_id: posts[0].id,
                      reason: `Kullanıcı profilden engellendi: @${profile.username}`,
                    })
                  }
                  Alert.alert('Engellendi', 'Kullanıcı engellendi. Gönderileri artık görünmeyecektir.')
                  router.back()
                },
              },
            ]
          )
        },
      })
    }

    buttons.push({ text: 'İptal', style: 'cancel' })

    Alert.alert(`@${profile.username}`, 'Bu kullanıcı ile ilgili işlem seçin:', buttons)
  }

  function getStats(votes: Vote[]) {
    const total = votes.length
    if (total === 0) return { countA: 0, countB: 0, total: 0, pctA: 50, pctB: 50, likePct: 0, dislikePct: 0, likeCount: 0, dislikeCount: 0 }
    const countB = votes.filter(v => v.value === true || (v as any).selected_option === 'B').length
    const countA = total - countB
    const pctA = Math.round((countA / total) * 100)
    const pctB = 100 - pctA
    return {
      countA,
      countB,
      total,
      pctA,
      pctB,
      likeCount: countB,
      dislikeCount: countA,
      likePct: pctB,
      dislikePct: pctA,
    }
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
    },
    backBtn: { paddingRight: 16 },
    backText: { fontSize: 20, color: theme.text },
    headerTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    scroll: { padding: 20 },
    
    heroCard: {
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 20,
      alignItems: 'center',
      marginBottom: 20,
      borderWidth: 0.5,
      borderColor: theme.border,
    },
    avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: theme.accent, marginBottom: 12 },
    avatarPlaceholder: {
      width: 90,
      height: 90,
      borderRadius: 45,
      backgroundColor: theme.bg,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    displayName: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 2 },
    handleText: { fontSize: 13, color: theme.textSub, marginBottom: 14 },
    actionBtn: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.accent,
      alignItems: 'center',
    },
    actionBtnText: { color: theme.bg, fontWeight: '600', fontSize: 13 },

    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    statCard: { flex: 1, backgroundColor: theme.card, borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 0.5, borderColor: theme.border },
    statNum: { fontSize: 20, fontWeight: '700', color: theme.accent },
    statLabel: { fontSize: 11, color: theme.textSub, marginTop: 4 },

    sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 14 },
    postCard: {
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
      borderWidth: 0.5,
      borderColor: theme.border,
    },
    postTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 12 },
    imagesRow: { flexDirection: 'row', gap: 8, height: 240, borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
    postImage: { flex: 1, height: '100%', backgroundColor: '#0a0a12' },
    
    voteBtnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
    voteBtnA: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: '#1b1a28',
      borderWidth: 1,
      borderColor: '#C9A84C',
      alignItems: 'center',
    },
    voteBtnB: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: '#7F77DD',
      alignItems: 'center',
    },
    voteBtnTextA: { color: '#C9A84C', fontWeight: '700', fontSize: 13 },
    voteBtnTextB: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
    
    barBg: { height: 8, backgroundColor: theme.bg, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', marginTop: 10 },
    barFillA: { height: '100%', backgroundColor: '#C9A84C' },
    barFillB: { height: '100%', backgroundColor: '#7F77DD' },
    barText: { fontSize: 11, color: theme.textSub },

    emptyPosts: { color: theme.textSub, fontSize: 13, textAlign: 'center', marginVertical: 30 },
  })

  const isSelf = session?.user.id === userId

  return (
    <SafeAreaView style={s.container}>
      {/* Top Bar */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>@{profile?.username || 'kullanici'}</Text>
        </View>
        {!isSelf && (
          <TouchableOpacity onPress={handleProfileModeration} style={{ padding: 6 }} activeOpacity={0.7}>
            <Ionicons name="ellipsis-horizontal" size={22} color={theme.textSub} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchAll}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        {/* Profile Card */}
        <View style={s.heroCard}>
          {profile?.avatar_url ? (
            <TouchableOpacity onPress={() => openZoom(profile.avatar_url!)} activeOpacity={0.85}>
              <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
            </TouchableOpacity>
          ) : (
            <View style={s.avatarPlaceholder}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: theme.textSub }}>
                {(profile?.username || 'D')[0].toUpperCase()}
              </Text>
            </View>
          )}

          <Text style={s.displayName}>{profile?.full_name || profile?.username || 'Kullanıcı'}</Text>
          <Text style={s.handleText}>@{profile?.username || 'kullanici'}</Text>

          {!isSelf && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                style={[
                  s.actionBtn,
                  friendshipStatus === 'accepted' && { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border },
                  friendshipStatus === 'pending' && { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.accent },
                ]}
                onPress={toggleFriendship}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    s.actionBtnText,
                    friendshipStatus === 'accepted' && { color: theme.textSub },
                    friendshipStatus === 'pending' && { color: theme.accent },
                  ]}
                >
                  {friendshipStatus === 'accepted' ? t('profile.inFriendsList') : friendshipStatus === 'pending' ? t('profile.requestSent') : t('profile.addFriendBtn')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: theme.accent }]}
                onPress={() => {
                  if (profile?.message_privacy === 'friends' && friendshipStatus !== 'accepted') {
                    Alert.alert('Gizlilik Kısıtlaması', 'Bu kullanıcı sadece arkadaşlarından gelen mesajları kabul etmektedir.')
                    return
                  }
                  router.push({ pathname: '/chat/[friendId]', params: { friendId: userId } })
                }}
                activeOpacity={0.8}
              >
                <Text style={s.actionBtnText}>{t('profile.sendMessageBtn')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Stats Row */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>{stats.posts}</Text>
            <Text style={s.statLabel}>{t('profile.statsPosts')}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{stats.votes}</Text>
            <Text style={s.statLabel}>{t('profile.statsVotes')}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{stats.friends}</Text>
            <Text style={s.statLabel}>{t('profile.statsFriends')}</Text>
          </View>
        </View>

        {/* Posts List */}
        {!isSelf && profile?.is_private && friendshipStatus !== 'accepted' ? (
          <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 30, alignItems: 'center', borderWidth: 0.5, borderColor: theme.border, marginTop: 10 }}>
            <Ionicons name="lock-closed-outline" size={36} color={theme.textSub} style={{ marginBottom: 10 }} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 6 }}>{t('profile.privateAccountTitle')}</Text>
            <Text style={{ fontSize: 13, color: theme.textSub, textAlign: 'center', lineHeight: 18 }}>
              {t('profile.privateAccountSub')}
            </Text>
          </View>
        ) : (
          <>
            <Text style={s.sectionTitle}>{t('profile.userPolls', { count: posts.length })}</Text>
            {posts.length === 0 ? (
              <Text style={s.emptyPosts}>{t('profile.noUserPolls')}</Text>
            ) : (
              posts.map(p => {
                const votes = (p.votes ?? []) as Vote[]
                const userVote = votes.find(v => v.voter_id === session?.user.id)
                const { countA, countB, pctA, pctB, likePct, dislikePct, likeCount, dislikeCount } = getStats(votes)
                const isVoting = votingMap[p.id]
                const isExpired = !p.is_active || (p.expires_at && new Date(p.expires_at).getTime() <= Date.now()) || (p.created_at && (Date.now() - new Date(p.created_at).getTime()) > 24 * 60 * 60 * 1000)

                return (
                  <View key={p.id} style={s.postCard}>
                    <Text style={s.postTitle}>{p.title}</Text>
                    
                    {/* Images */}
                    <View style={s.imagesRow}>
                      <TouchableOpacity
                        style={{ flex: 1, height: '100%' }}
                        onPress={() => openZoom(p.image_a_url || (p as any).image_url)}
                        activeOpacity={0.85}
                      >
                        <Image source={{ uri: p.image_a_url || (p as any).image_url }} style={{ width: '100%', height: '100%', backgroundColor: '#0a0a12' }} resizeMode="contain" />
                      </TouchableOpacity>

                      {p.image_b_url ? (
                        <TouchableOpacity
                          style={{ flex: 1, height: '100%' }}
                          onPress={() => openZoom(p.image_b_url!)}
                          activeOpacity={0.85}
                        >
                          <Image source={{ uri: p.image_b_url }} style={{ width: '100%', height: '100%', backgroundColor: '#0a0a12' }} resizeMode="contain" />
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    {/* Vote Percentage Bar if Voted or Expired */}
                    {userVote || isExpired ? (
                      <View style={{ marginTop: 4 }}>
                        <View style={s.barBg}>
                          <View style={[s.barFillA, { width: `${p.image_b_url ? pctA : likePct}%` }]} />
                          <View style={[s.barFillB, { width: `${p.image_b_url ? pctB : dislikePct}%` }]} />
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                          <Text style={s.barText}>
                            {p.image_b_url ? `${t('feed.optionLeft')}: %${pctA} (${countA} ${t('results.votes')})` : `${t('results.likedBar')}: %${likePct} (${likeCount} ${t('results.votes')})`}
                          </Text>
                          <Text style={s.barText}>
                            {p.image_b_url ? `${t('feed.optionRight')}: %${pctB} (${countB} ${t('results.votes')})` : `${t('results.dislikedBar')}: %${dislikePct} (${dislikeCount} ${t('results.votes')})`}
                          </Text>
                        </View>
                        {isExpired && !userVote && (
                          <Text style={{ fontSize: 10, color: theme.textSub, textAlign: 'center', marginTop: 6 }}>
                            {t('profile.pollExpiredNotice')}
                          </Text>
                        )}
                      </View>
                    ) : (
                      /* Interactive Voting Buttons if Not Voted Yet */
                      <View style={s.voteBtnRow}>
                        <TouchableOpacity
                          style={s.voteBtnA}
                          onPress={() => handleVoteOnPost(p, 'A')}
                          disabled={isVoting}
                          activeOpacity={0.8}
                        >
                          {isVoting ? (
                            <ActivityIndicator size="small" color="#C9A84C" />
                          ) : (
                            <Text style={s.voteBtnTextA}>{p.image_b_url ? t('feed.optionLeft') : t('feed.dislike')}</Text>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={s.voteBtnB}
                          onPress={() => handleVoteOnPost(p, 'B')}
                          disabled={isVoting}
                          activeOpacity={0.8}
                        >
                          {isVoting ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text style={s.voteBtnTextB}>{p.image_b_url ? t('feed.optionRight') : t('feed.like')}</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )
              })
            )}
          </>
        )}
      </ScrollView>

      {/* Full-Screen Zoomable Photo Lightbox */}
      {zoomMounted && zoomUri ? (
        <Modal visible={true} transparent animationType="fade" onRequestClose={closeZoom} statusBarTranslucent>
          <ZoomablePhoto uri={zoomUri} accentColor={theme.accent} onClose={closeZoom} />
        </Modal>
      ) : null}
    </SafeAreaView>
  )
}
