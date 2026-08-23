import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView,
  ActivityIndicator, Dimensions, TouchableOpacity, Alert,
} from 'react-native'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import SwipeCard from '../../components/SwipeCard'
import type { Post } from '../../lib/types'
import CommentInput from '../../components/CommentInput'
import { useFocusEffect } from '@react-navigation/native'
import { useRouter } from 'expo-router'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

export default function VoteScreen() {
  const { theme, session } = useApp()
  const router = useRouter()
  const userId = session?.user.id
  const [posts, setPosts] = useState<Post[]>([])
  const [friendPosts, setFriendPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'public' | 'friends'>('public')

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchPosts()
      }
    }, [userId])
  )

  async function fetchPosts() {
    setLoading(true)
    const { data: votedIds } = await supabase
      .from('votes').select('post_id').eq('voter_id', session?.user.id)
    const voted: string[] = votedIds?.map(v => v.post_id) || []

    const { data: blockedRows } = await supabase
      .from('blocked_users').select('blocked_id').eq('blocker_id', session?.user.id)
    const blockedIds: string[] = blockedRows?.map(b => b.blocked_id) || []

    // Genel oylamalar
    let publicQuery = supabase.from('posts').select('*')
      .eq('audience', 'public')
      .eq('is_active', true)
      .neq('user_id', session?.user.id)
    if (voted.length > 0) publicQuery = publicQuery.not('id', 'in', `(${voted.join(',')})`)
    if (blockedIds.length > 0) publicQuery = publicQuery.not('user_id', 'in', `(${blockedIds.join(',')})`)
    const { data: publicPosts } = await publicQuery.order('created_at', { ascending: false })

    // Arkadaş oylamaları
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
      .neq('user_id', session?.user.id)
    if (friendIds.length > 0) friendQuery = friendQuery.in('user_id', friendIds)
    else friendQuery = friendQuery.eq('user_id', 'none')
    if (voted.length > 0) friendQuery = friendQuery.not('id', 'in', `(${voted.join(',')})`)
    if (blockedIds.length > 0) friendQuery = friendQuery.not('user_id', 'in', `(${blockedIds.join(',')})`)
    const { data: fPosts } = await friendQuery.order('created_at', { ascending: false })

    setPosts((publicPosts as Post[]) || [])
    setFriendPosts((fPosts as Post[]) || [])
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
      'Gönderiyi bildir',
      'Bu gönderiyi uygunsuz içerik nedeniyle bildirmek istediğine emin misin?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Bildir',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('reports').insert({
              reporter_id: session?.user.id,
              post_id: current.id,
              reason: 'Uygunsuz içerik',
            })
            if (error && error.code !== '23505') {
              Alert.alert('Hata', 'Bildirim gönderilemedi, tekrar dene.')
              return
            }
            Alert.alert('Teşekkürler', 'Bildirimin alındı, inceleyeceğiz.')
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
      'Kullanıcıyı engelle',
      'Bu kullanıcının gönderilerini bir daha görmek istemiyor musun?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Engelle',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('blocked_users').insert({
              blocker_id: session?.user.id,
              blocked_id: current.user_id,
            })
            if (error && error.code !== '23505') {
              Alert.alert('Hata', 'Engelleme yapılamadı, tekrar dene.')
              return
            }
            Alert.alert('Engellendi', 'Bu kullanıcının gönderileri artık görünmeyecek.')
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
    tabRow: { flexDirection: 'row', backgroundColor: theme.card, borderRadius: 20, padding: 3, marginBottom: 12, borderWidth: 0.5, borderColor: theme.border },
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

  if (loading) return (
    <SafeAreaView style={s.container}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    </SafeAreaView>
  )

  return (
    <SafeAreaView style={s.container}>
      <View style={s.inner}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: SCREEN_WIDTH - 24, marginVertical: 8 }}>
          <Text style={s.logo}>dythin<Text style={s.logoDot}>.</Text></Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.card, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5, borderColor: theme.border }}
            onPress={() => router.push('/messages')}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 13, color: theme.text, fontWeight: '600' }}>Mesajlar 💬</Text>
          </TouchableOpacity>
        </View>

        {/* Centered Tabs Row with Far-Right Moderation Icons */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: SCREEN_WIDTH - 24, position: 'relative', marginBottom: 8 }}>
          <View style={s.tabRow}>
            <TouchableOpacity style={[s.tabBtn, tab === 'public' && s.tabBtnActive]} onPress={() => setTab('public')}>
              <Text style={[s.tabText, tab === 'public' && s.tabTextActive]}>🌍 Genel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tabBtn, tab === 'friends' && s.tabBtnActive]} onPress={() => setTab('friends')}>
              <Text style={[s.tabText, tab === 'friends' && s.tabTextActive]}>👥 Arkadaşlar</Text>
            </TouchableOpacity>
          </View>

          {current && (
            <View style={{ position: 'absolute', right: 4, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <TouchableOpacity onPress={handleReport} style={{ padding: 4 }}>
                <Text style={{ fontSize: 14 }}>🚩</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleBlock} style={{ padding: 4 }}>
                <Text style={{ fontSize: 14 }}>🚫</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

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
                      <Text style={s.badgeLetterPass}>✕</Text>
                    </View>
                    <View style={s.btnTextCol}>
                      <Text style={s.btnMainTextPass}>Geçtim</Text>
                      <Text style={s.btnSubText}>Beğenmedim</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity style={[s.actionBtn, s.btnCardLike]} onPress={() => handleVote('B')} activeOpacity={0.75}>
                    <View style={s.badgeCircleLike}>
                      <Text style={s.badgeLetterLike}>✓</Text>
                    </View>
                    <View style={s.btnTextCol}>
                      <Text style={s.btnMainTextLike}>Beğendim</Text>
                      <Text style={s.btnSubTextB}>Harika Seçim</Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        ) : (
          <View style={s.empty}>
            <Text style={{ fontSize: 44 }}>
              {tab === 'friends' ? '👥' : '✨'}
            </Text>
            <Text style={s.emptyText}>
              {tab === 'friends' ? 'Arkadaşlarından henüz\noylama yok' : 'Şimdilik tüm oylamalar\ntamamlandı'}
            </Text>
            <TouchableOpacity onPress={fetchPosts} style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.card, borderRadius: 16, marginTop: 10, borderWidth: 0.5, borderColor: theme.border }}>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>Yenile 🔄</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}
