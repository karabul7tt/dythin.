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
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import type { Profile, Post, Vote } from '../lib/types'

export default function UserProfileScreen() {
  const { theme, session } = useApp()
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
    // Tamamen unmount et, sonra yeni URI ile yeniden mount et
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

  useEffect(() => {
    if (userId) {
      fetchUserProfile()
      fetchUserPosts()
      fetchFriendshipStatus()
    }
  }, [userId])

  async function fetchUserProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) {
      setProfile(data as Profile)
    }

    // Stats
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
      Alert.alert('Oyunuz Kaydedildi ✓', option === 'A' ? 'Soldaki seçeneğe oy verdiniz.' : 'Sağdaki seçeneğe oy verdiniz.')
      fetchUserPosts()
    }
  }

  function getStats(votes: Vote[]) {
    const total = votes.length
    if (total === 0) return { countA: 0, countB: 0, total: 0, pctA: 50, pctB: 50 }
    const countB = votes.filter(v => v.value === true || (v as any).selected_option === 'B').length
    const countA = total - countB
    const pctA = Math.round((countA / total) * 100)
    const pctB = 100 - pctA
    return { countA, countB, total, pctA, pctB }
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
    },
    backBtn: { paddingRight: 16 },
    backText: { fontSize: 20, color: theme.text },
    headerTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    scroll: { padding: 20 },
    
    // Profile Hero Card
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

    // Stats Grid
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    statCard: { flex: 1, backgroundColor: theme.card, borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 0.5, borderColor: theme.border },
    statNum: { fontSize: 20, fontWeight: '700', color: theme.accent },
    statLabel: { fontSize: 11, color: theme.textSub, marginTop: 4 },

    // Posts Section
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
    
    // Vote Buttons Inside Card
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
    
    // Progress Bar
    barBg: { height: 8, backgroundColor: theme.bg, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', marginTop: 10 },
    barFillA: { height: '100%', backgroundColor: '#C9A84C' },
    barFillB: { height: '100%', backgroundColor: '#7F77DD' },
    barText: { fontSize: 11, color: theme.textSub },

    emptyPosts: { color: theme.textSub, fontSize: 13, textAlign: 'center', marginVertical: 30 },
  })

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      </SafeAreaView>
    )
  }

  const isSelf = session?.user.id === userId

  return (
    <SafeAreaView style={s.container}>
      {/* Top Bar */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backText}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>@{profile?.username || 'kullanici'}</Text>
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={s.heroCard}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
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
                  {friendshipStatus === 'accepted' ? 'Arkadaş Listende' : friendshipStatus === 'pending' ? 'İstek Gönderildi' : '+ Arkadaş Ekle'}
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
                <Text style={s.actionBtnText}>Mesaj Gönder</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Stats Row */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>{stats.posts}</Text>
            <Text style={s.statLabel}>Paylaşım</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{stats.votes}</Text>
            <Text style={s.statLabel}>Oy</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{stats.friends}</Text>
            <Text style={s.statLabel}>Arkadaş</Text>
          </View>
        </View>

        {/* Posts List */}
        {!isSelf && profile?.is_private && friendshipStatus !== 'accepted' ? (
          <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 30, alignItems: 'center', borderWidth: 0.5, borderColor: theme.border, marginTop: 10 }}>
            <Text style={{ fontSize: 32, marginBottom: 10 }}>🔒</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 6 }}>Bu Hesap Gizli</Text>
            <Text style={{ fontSize: 13, color: theme.textSub, textAlign: 'center', lineHeight: 18 }}>
              Bu kullanıcının paylaşımlarını ve oylamalarını görebilmek için arkadaş olmalısınız.
            </Text>
          </View>
        ) : (
          <>
            <Text style={s.sectionTitle}>Oylamaları ({posts.length})</Text>
            {posts.length === 0 ? (
              <Text style={s.emptyPosts}>Henüz paylaştığı bir oylama bulunmuyor.</Text>
            ) : (
              posts.map(p => {
                const votes = (p.votes ?? []) as Vote[]
                const userVote = votes.find(v => v.voter_id === session?.user.id)
                const { countA, countB, total, pctA, pctB } = getStats(votes)
                const isVoting = votingMap[p.id]

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

                    {/* Vote Percentage Bar if Voted */}
                    {userVote ? (
                      <View style={{ marginTop: 4 }}>
                        <View style={s.barBg}>
                          <View style={[s.barFillA, { width: `${pctA}%` }]} />
                          <View style={[s.barFillB, { width: `${pctB}%` }]} />
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                          <Text style={s.barText}>{p.image_b_url ? 'Soldaki' : 'Beğendim'}: %{pctA} ({countA} oy)</Text>
                          <Text style={s.barText}>{p.image_b_url ? 'Sağdaki' : 'Geçtim'}: %{pctB} ({countB} oy)</Text>
                        </View>
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
                          {isVoting ? <ActivityIndicator size="small" color="#C9A84C" /> : <Text style={s.voteBtnTextA}>{p.image_b_url ? 'Soldaki' : 'Beğendim'}</Text>}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={s.voteBtnB}
                          onPress={() => handleVoteOnPost(p, 'B')}
                          disabled={isVoting}
                          activeOpacity={0.8}
                        >
                          {isVoting ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={s.voteBtnTextB}>{p.image_b_url ? 'Sağdaki' : 'Geçtim'}</Text>}
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

      {/* Full-Screen Photo Lightbox */}
      {zoomMounted && zoomUri ? (
        <Modal visible={true} transparent animationType="fade" onRequestClose={closeZoom} statusBarTranslucent>
          <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>

            {/* Fotoğraf tam ekran */}
            <Image
              source={{ uri: zoomUri }}
              style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.80 }}
              resizeMode="contain"
            />

            {/* X butonu sağ üst */}
            <TouchableOpacity
              style={{ position: 'absolute', top: 55, right: 20, backgroundColor: 'rgba(255,255,255,0.2)', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
              onPress={closeZoom}
              activeOpacity={0.8}
            >
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>

            {/* Arka plana basınca kapat */}
            <TouchableOpacity
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 110 }}
              activeOpacity={1}
              onPress={closeZoom}
            />

            {/* Kapat butonu alt */}
            <TouchableOpacity
              style={{ position: 'absolute', bottom: 45, backgroundColor: theme.accent, paddingHorizontal: 32, paddingVertical: 13, borderRadius: 25 }}
              onPress={closeZoom}
              activeOpacity={0.8}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Kapat</Text>
            </TouchableOpacity>

          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  )
}
