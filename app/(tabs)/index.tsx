import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView,
  ActivityIndicator, Dimensions, TouchableOpacity, Alert,
  Platform,
} from 'react-native'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import SwipeCard from '../../components/SwipeCard'
import type { Post } from '../../lib/types'
import CommentInput from '../../components/CommentInput'
import { useFocusEffect } from '@react-navigation/native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import CustomRefreshContainer from '../../components/CustomRefreshContainer'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

export default function VoteScreen() {
  const { theme, session } = useApp()
  const router = useRouter()
  const userId = session?.user.id
  const isDark = theme.bg === '#0e0e1a' || theme.bg === '#111108'
  const refreshColor = isDark ? '#ffffff' : '#555555'
  const [posts, setPosts] = useState<Post[]>([])
  const [friendPosts, setFriendPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<'public' | 'friends'>('public')

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchPosts()
      }
    }, [userId])
  )

  async function handleRefresh() {
    setRefreshing(true)
    const minDelay = new Promise(resolve => setTimeout(resolve, 600))
    await Promise.all([fetchPosts(true), minDelay])
    setRefreshing(false)
  }

  async function fetchPosts(isPull = false) {
    if (isPull) setRefreshing(true)
    const { data: votedIds } = await supabase
      .from('votes').select('post_id').eq('voter_id', session?.user.id)
    const voted: string[] = votedIds?.map(v => v.post_id) || []

    const { data: blockedRows } = await supabase
      .from('blocked_users').select('blocked_id').eq('blocker_id', session?.user.id)
    const blockedIds: string[] = blockedRows?.map(b => b.blocked_id) || []

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Genel oylamalar - 24 saat kuralı (24 saat sonra başkalarının oylama akışından kalkar)
    let publicQuery = supabase.from('posts').select('*')
      .eq('audience', 'public')
      .eq('is_active', true)
      .gte('created_at', twentyFourHoursAgo)
      .neq('user_id', session?.user.id)
    if (voted.length > 0) publicQuery = publicQuery.not('id', 'in', `(${voted.join(',')})`)
    if (blockedIds.length > 0) publicQuery = publicQuery.not('user_id', 'in', `(${blockedIds.join(',')})`)
    const { data: publicPosts } = await publicQuery.order('created_at', { ascending: false })

    // Arkadaş oylamaları - 24 saat kuralı (24 saat sonra başkalarının oylama akışından kalkar)
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, receiver_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${session?.user.id},receiver_id.eq.${session?.user.id}`)

    const friendIds: string[] = friendships?.map(f =>
      f.requester_id === session?.user.id ? f.receiver_id : f.requester_id
    ) || []

    let friendQuery = supabase.from('posts').select('*')
      .eq('audience', 'friends')
      .eq('is_active', true)
      .gte('created_at', twentyFourHoursAgo)
      .neq('user_id', session?.user.id)
    if (friendIds.length > 0) friendQuery = friendQuery.in('user_id', friendIds)
    else friendQuery = friendQuery.eq('user_id', 'none')
    if (voted.length > 0) friendQuery = friendQuery.not('id', 'in', `(${voted.join(',')})`)
    if (blockedIds.length > 0) friendQuery = friendQuery.not('user_id', 'in', `(${blockedIds.join(',')})`)
    const { data: fPosts } = await friendQuery.order('created_at', { ascending: false })

    // İstemci tarafı doğrulama (expires_at veya 24 saat kontrolü)
    const isPostActive = (p: Post) => {
      if (!p.is_active) return false
      if (p.expires_at && new Date(p.expires_at).getTime() <= Date.now()) return false
      if (p.created_at && (Date.now() - new Date(p.created_at).getTime()) > 24 * 60 * 60 * 1000) return false
      return true
    }

    setPosts(((publicPosts as Post[]) || []).filter(isPostActive))
    setFriendPosts(((fPosts as Post[]) || []).filter(isPostActive))
    setLoading(false)
  }

  // State for comment modal
  const [commentVisible, setCommentVisible] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [currentVoteId, setCurrentVoteId] = useState<string | null>(null)

  // Handle vote with A/B option
  async function handleVote(option: 'A' | 'B') {
    const current = tab === 'public' ? posts[0] : friendPosts[0]
    if (!current) return
    let { data, error } = await supabase.from('votes').insert({
      post_id: current.id,
      voter_id: session?.user.id,
      selected_option: option,
      value: option === 'B',
    }).select('id')

    if (error && error.code === '42703') {
      // Fallback if selected_option column does not exist yet
      const res = await supabase.from('votes').insert({
        post_id: current.id,
        voter_id: session?.user.id,
        value: option === 'B',
      }).select('id')
      data = res.data
      error = res.error
    }

    if (error) {
      Alert.alert('Hata', error.message)
      return
    }
    // Remove current post from stack
    if (tab === 'public') setPosts(prev => prev.slice(1))
    else setFriendPosts(prev => prev.slice(1))
  }

  // Submit comment for the current vote
  async function submitComment() {
    if (!currentVoteId || !commentText.trim()) return
    const { error } = await supabase.from('votes').update({ comment: commentText.trim() }).eq('id', currentVoteId)
    if (error && error.code !== '42703') {
      Alert.alert('Hata', error.message)
    }
    setCommentVisible(false)
    setCommentText('')
    setCurrentVoteId(null)
  }

  function handleReport() {
    const current = tab === 'public' ? posts[0] : friendPosts[0]
    if (!current) return
    Alert.alert(
      'Gönderiyi Bildir',
      'Bu gönderiyi sakıncalı veya uygunsuz içerik nedeniyle bildirmek istiyor musunuz? Şikayet edilen içerikler 24 saat içinde incelenir ve kaldırılır.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Bildir',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('reports').insert({
              reporter_id: session?.user.id,
              post_id: current.id,
              reason: 'Uygunsuz/Sakıncalı içerik',
            })
            if (error && error.code !== '23505') {
              Alert.alert('Hata', 'Bildirim gönderilemedi, lütfen tekrar deneyin.')
              return
            }
            Alert.alert(
              'Bildiriminiz Alındı',
              'Teşekkürler. Gönderi inceleme için bildirildi ve akışınızdan kaldırıldı. Sakıncalı içerikler 24 saat içinde incelenip kalıcı olarak silinir.'
            )
            if (tab === 'public') setPosts(prev => prev.slice(1))
            else setFriendPosts(prev => prev.slice(1))
          },
        },
      ]
    )
  }

  function handleBlock() {
    const current = tab === 'public' ? posts[0] : friendPosts[0]
    if (!current) return
    Alert.alert(
      'Kullanıcıyı Engelle',
      'Bu kullanıcıyı engellemek istediğinize emin misiniz? Bu kullanıcının tüm gönderileri akışınızdan anında kaldırılacak ve geliştiriciye bildirilecektir.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Engelle',
          style: 'destructive',
          onPress: async () => {
            // 1. Engellenen kullanıcılar tablosuna ekle
            const { error } = await supabase.from('blocked_users').insert({
              blocker_id: session?.user.id,
              blocked_id: current.user_id,
            })
            // 2. Geliştiriciye otomatik rapor gönder (Apple Guideline 1.2 gereksinimi)
            await supabase.from('reports').insert({
              reporter_id: session?.user.id,
              post_id: current.id,
              reason: 'Kullanıcı engellendi (Uygunsuz içerik / Otomatik moderasyon bildirimi)',
            })
            if (error && error.code !== '23505') {
              Alert.alert('Hata', 'Engelleme yapılamadı, lütfen tekrar deneyin.')
              return
            }
            Alert.alert(
              'Kullanıcı Engellendi',
              'Kullanıcı engellendi. Gönderileri akışınızdan anında temizlendi ve moderasyon ekibine bildirildi.'
            )
            setPosts(prev => prev.filter(p => p.user_id !== current.user_id))
            setFriendPosts(prev => prev.filter(p => p.user_id !== current.user_id))
          },
        },
      ]
    )
  }

  const currentPosts = tab === 'public' ? posts : friendPosts
  const current = currentPosts[0]

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    inner: { flex: 1, alignItems: 'center' },
    logo: { fontSize: 24, fontWeight: '700', color: theme.text, alignSelf: 'flex-start', margin: 20 },
    logoDot: { color: theme.accent },
    tabRow: { flexDirection: 'row', backgroundColor: theme.card, borderRadius: 20, padding: 3, marginBottom: 0, borderWidth: 0.5, borderColor: theme.border },
    tabBtn: { paddingHorizontal: 20, paddingVertical: 7, borderRadius: 16 },
    tabBtnActive: { backgroundColor: theme.accent },
    tabText: { fontSize: 12, color: theme.textSub, fontWeight: '500' },
    tabTextActive: { color: theme.bg },
    cardArea: { height: 530, width: SCREEN_WIDTH - 20, alignItems: 'center', justifyContent: 'center' },
    btnRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, width: SCREEN_WIDTH - 20, justifyContent: 'center', marginTop: 6 },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 22,
      gap: 10,
      minHeight: 58,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    btnCardA: { backgroundColor: '#1b1a28', borderWidth: 1.5, borderColor: '#C9A84C' },
    btnCardB: { backgroundColor: '#7F77DD', borderWidth: 1.5, borderColor: '#9E97F0' },
    badgeCircleA: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(201, 168, 76, 0.2)', borderWidth: 1, borderColor: '#C9A84C', alignItems: 'center', justifyContent: 'center' },
    badgeLetterA: { color: '#C9A84C', fontSize: 15, fontWeight: '800' },
    badgeCircleB: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.25)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
    badgeLetterB: { color: '#fff', fontSize: 15, fontWeight: '800' },
    btnTextCol: { flexDirection: 'column' },
    btnMainTextA: { fontSize: 14, fontWeight: '700', color: '#C9A84C', letterSpacing: 0.3 },
    btnMainTextB: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
    btnSubText: { color: '#888', fontSize: 10, marginTop: 1 },
    btnSubTextB: { color: 'rgba(255,255,255,0.8)', fontSize: 10, marginTop: 1 },
    btnCardPass: { backgroundColor: '#181724', borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.12)' },
    btnCardLike: { backgroundColor: '#7F77DD', borderWidth: 1.5, borderColor: '#9E97F0' },
    badgeCirclePass: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.08)', alignItems: 'center', justifyContent: 'center' },
    badgeLetterPass: { color: '#aaa', fontSize: 14, fontWeight: '700' },
    badgeCircleLike: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.25)', alignItems: 'center', justifyContent: 'center' },
    badgeLetterLike: { color: '#fff', fontSize: 14, fontWeight: '800' },
    btnMainTextPass: { fontSize: 14, fontWeight: '700', color: '#aaa' },
    btnMainTextLike: { fontSize: 14, fontWeight: '700', color: '#fff' },
    empty: { alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12 },
    emptyText: { color: theme.textSub, fontSize: 15, textAlign: 'center' },
    counter: { fontSize: 11, color: theme.textSub, marginBottom: 8 },
    moderationRow: { flexDirection: 'row', gap: 16, marginBottom: 4 },
    moderationBtn: { paddingHorizontal: 10, paddingVertical: 4 },
    moderationText: { fontSize: 11, color: theme.textSub },
  })

  function handleSkip() {
    if (tab === 'public') {
      setPosts(prev => prev.slice(1))
    } else {
      setFriendPosts(prev => prev.slice(1))
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <CustomRefreshContainer
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingBottom: 20 }}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: SCREEN_WIDTH - 24, marginVertical: 8 }}>
          <TouchableOpacity onPress={handleRefresh} activeOpacity={0.7}>
            <Text style={s.logo}>dythin<Text style={s.logoDot}>.</Text></Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.card, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5, borderColor: theme.border }}
            onPress={() => router.push('/messages')}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubbles-outline" size={16} color={theme.text} />
            <Text style={{ fontSize: 13, color: theme.text, fontWeight: '600' }}>Mesajlar</Text>
          </TouchableOpacity>
        </View>

        {/* Centered Tabs Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: SCREEN_WIDTH - 24, marginBottom: 8 }}>
          <View style={s.tabRow}>
            <TouchableOpacity
              style={[s.tabBtn, tab === 'public' && s.tabBtnActive, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
              onPress={() => setTab('public')}
            >
              <Ionicons name="globe-outline" size={14} color={tab === 'public' ? theme.bg : theme.textSub} />
              <Text style={[s.tabText, tab === 'public' && s.tabTextActive]}>Genel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tabBtn, tab === 'friends' && s.tabBtnActive, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
              onPress={() => setTab('friends')}
            >
              <Ionicons name="people-outline" size={14} color={tab === 'friends' ? theme.bg : theme.textSub} />
              <Text style={[s.tabText, tab === 'friends' && s.tabTextActive]}>Arkadaşlar</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Moderation Controls (Pulled down cleanly below the tabs) */}
        {current && (
          <View style={{ width: SCREEN_WIDTH - 24, flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
            <TouchableOpacity
              onPress={handleReport}
              style={{
                backgroundColor: theme.card,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 14,
                borderWidth: 0.5,
                borderColor: theme.border,
              }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 11, color: theme.textSub, fontWeight: '600' }}>Bildir</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleBlock}
              style={{
                backgroundColor: theme.card,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 14,
                borderWidth: 0.5,
                borderColor: theme.border,
              }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 11, color: theme.textSub, fontWeight: '600' }}>Engelle</Text>
            </TouchableOpacity>
          </View>
        )}

        {current ? (
          <>
            <View style={s.cardArea}>
              {currentPosts[1] && (
                <View style={{ position: 'absolute', width: SCREEN_WIDTH - 20, height: 530, borderRadius: 20, backgroundColor: theme.card, opacity: 0.4, transform: [{ scale: 0.95 }, { translateY: 10 }] }} />
              )}
              <SwipeCard
                key={current.id}
                post={current}
                onSwipeLeft={() => handleVote('A')}
                onSwipeRight={() => handleVote('B')}
                onSwipeDown={handleSkip}
              />
            </View>
            <View style={s.btnRow}>
              {current.image_b_url ? (
                <>
                  <TouchableOpacity style={[s.actionBtn, s.btnCardA]} onPress={() => handleVote('A')} activeOpacity={0.75}>
                    <View style={s.btnTextCol}>
                      <Text style={s.btnMainTextA}>Soldaki</Text>
                      <Text style={s.btnSubText}>Sola Kaydır</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity style={[s.actionBtn, s.btnCardB]} onPress={() => handleVote('B')} activeOpacity={0.75}>
                    <View style={s.btnTextCol}>
                      <Text style={s.btnMainTextB}>Sağdaki</Text>
                      <Text style={s.btnSubTextB}>Sağa Kaydır</Text>
                    </View>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity style={[s.actionBtn, s.btnCardPass]} onPress={() => handleVote('A')} activeOpacity={0.75}>
                    <View style={s.badgeCirclePass}>
                      <Ionicons name="close" size={18} color="#aaa" />
                    </View>
                    <View style={s.btnTextCol}>
                      <Text style={s.btnMainTextPass}>Beğenmedim</Text>
                      <Text style={s.btnSubText}>Geçtim (Sola Kaydır)</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity style={[s.actionBtn, s.btnCardLike]} onPress={() => handleVote('B')} activeOpacity={0.75}>
                    <View style={s.badgeCircleLike}>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </View>
                    <View style={s.btnTextCol}>
                      <Text style={s.btnMainTextLike}>Beğendim</Text>
                      <Text style={s.btnSubTextB}>Harika Seçim (Sağa Kaydır)</Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        ) : (
          <View style={[s.empty, { flex: 1, justifyContent: 'center', minHeight: 400 }]}>
            <Ionicons
              name={tab === 'friends' ? 'people-outline' : 'sparkles-outline'}
              size={48}
              color={theme.accent}
            />
            <Text style={s.emptyText}>
              {tab === 'friends' ? 'Arkadaşlarından henüz\noylama yok' : 'Şimdilik tüm oylamalar\ntamamlandı'}
            </Text>
            <TouchableOpacity onPress={handleRefresh} style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: theme.card, borderRadius: 20, marginTop: 16, borderWidth: 0.5, borderColor: theme.border }}>
              <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600' }}>Yenile</Text>
            </TouchableOpacity>
          </View>
        )}
      </CustomRefreshContainer>
    </SafeAreaView>
  )
}
