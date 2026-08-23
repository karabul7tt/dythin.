import { useCallback, useState } from 'react'
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Modal,
  Dimensions,
} from 'react-native'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import type { Post, Vote } from '../../lib/types'
import { useFocusEffect } from '@react-navigation/native'

export default function ResultsScreen() {
  const { theme, session } = useApp()
  const userId = session?.user.id
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [zoomUri, setZoomUri] = useState<string | null>(null)
  const [zoomKey, setZoomKey] = useState<number>(0)

  const openZoom = (uri: string) => {
    setZoomKey(Date.now())
    setZoomUri(uri)
  }

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchResults()
      }
    }, [userId])
  )

  async function fetchResults() {
    setLoading(true)
    const { data, error } = await supabase
      .from('posts')
      .select('*, votes(*)')
      .eq('user_id', session?.user.id)
      .order('created_at', { ascending: false })

    if (!error) {
      setPosts((data as Post[]) || [])
    }
    setLoading(false)
  }

  async function deletePost(postId: string) {
    Alert.alert(
      'Paylaşımı Sil',
      'Bu paylaşım ve tüm oyları kalıcı olarak silinecek. Emin misin?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('posts').delete().eq('id', postId)
            if (error) {
              Alert.alert('Hata', 'Paylaşım silinemedi.')
            } else {
              setPosts(prev => prev.filter(p => p.id !== postId))
            }
          },
        },
      ]
    )
  }

  function getStats(votes: Vote[]) {
    let countA = 0
    let countB = 0
    votes.forEach(v => {
      if (v.selected_option === 'A' || (v.selected_option === undefined && v.value === false)) countA++
      else if (v.selected_option === 'B' || (v.selected_option === undefined && v.value === true)) countB++
      else countA++
    })
    const total = countA + countB
    const pctA = total > 0 ? Math.round((countA / total) * 100) : 0
    const pctB = total > 0 ? Math.round((countB / total) * 100) : 0
    return { countA, countB, total, pctA, pctB }
  }

  function getTimeRemaining(expiresAt?: string) {
    if (!expiresAt) return null
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0) return 'Süre doldu (Kapandı)'
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (hours > 0) return `${hours} sa ${mins} dk kaldı`
    return `${mins} dk kaldı`
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { padding: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    logo: { fontSize: 24, fontWeight: '700', color: theme.text },
    logoDot: { color: theme.accent },
    card: { borderRadius: 16, overflow: 'hidden', borderWidth: 0.5, borderColor: theme.border, marginBottom: 16, backgroundColor: theme.card },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    thumbSingle: { width: 52, height: 52, borderRadius: 10 },
    thumbABContainer: { flexDirection: 'row', gap: 4, width: 68, height: 52, alignItems: 'center', justifyContent: 'center' },
    thumbHalf: { width: 32, height: 52, borderRadius: 8, overflow: 'hidden' },
    cardTitle: { fontSize: 13, fontWeight: '600', color: theme.text, flex: 1 },
    cardSub: { fontSize: 10, color: theme.textSub, marginTop: 2 },
    deleteBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 0.5, borderColor: '#c0605a', alignItems: 'center', justifyContent: 'center' },
    cardBody: { padding: 12 },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    barLabel: { fontSize: 11, width: 70, fontWeight: '600' },
    barTrack: { flex: 1, height: 8, backgroundColor: theme.border, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 4 },
    barNum: { fontSize: 11, color: theme.textSub, width: 36, textAlign: 'right', fontWeight: '600' },
    verdict: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 8, padding: 10, marginTop: 8 },
    verdictText: { fontSize: 12, fontWeight: '600', flex: 1 },
    verdictPct: { fontSize: 14, fontWeight: '700' },
    commentsSection: { marginTop: 12, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: theme.border },
    commentsHeader: { fontSize: 11, fontWeight: '700', color: theme.textSub, marginBottom: 6 },
    commentItem: { backgroundColor: theme.bg, borderRadius: 8, padding: 8, marginBottom: 6, borderWidth: 0.5, borderColor: theme.border },
    commentText: { fontSize: 12, color: theme.text },
    commentMeta: { fontSize: 10, color: theme.accent, marginTop: 2, fontWeight: '500' },
    empty: { alignItems: 'center', padding: 60 },
    emptyText: { color: theme.textSub, fontSize: 14, marginTop: 12 },
  })

  if (loading)
    return (
      <SafeAreaView style={s.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      </SafeAreaView>
    )

  return (
    <SafeAreaView style={s.container}>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.logo}>
            dythin<Text style={s.logoDot}>.</Text>
          </Text>
        </View>

        {posts.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 40 }}>📊</Text>
            <Text style={s.emptyText}>Henüz paylaşımın yok</Text>
          </View>
        ) : (
          posts.map(post => {
            const votes = (post.votes ?? []) as Vote[]
            const { countA, countB, total, pctA, pctB } = getStats(votes)
            const isAWinning = pctA >= pctB
            const isAB = !!post.image_b_url
            const timeRemaining = getTimeRemaining(post.expires_at)
            const comments = votes.filter(v => v.comment && v.comment.trim().length > 0)

            return (
              <View key={post.id} style={s.card}>
                <View style={s.cardTop}>
                  {isAB ? (
                    <View style={s.thumbABContainer}>
                      <TouchableOpacity onPress={() => openZoom(post.image_a_url || (post as any).image_url)} activeOpacity={0.8}>
                        <Image source={{ uri: post.image_a_url || (post as any).image_url }} style={s.thumbHalf} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => openZoom(post.image_b_url!)} activeOpacity={0.8}>
                        <Image source={{ uri: post.image_b_url }} style={s.thumbHalf} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => openZoom(post.image_a_url || (post as any).image_url)} activeOpacity={0.8}>
                      <Image source={{ uri: post.image_a_url || (post as any).image_url }} style={s.thumbSingle} />
                    </TouchableOpacity>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{post.title}</Text>
                    <Text style={s.cardSub}>
                      {total} oy · {timeRemaining || (post.is_active ? '🟢 Aktif' : '🔴 Kapandı')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 0.5, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}
                    onPress={() => deletePost(post.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: theme.textSub, fontSize: 12, fontWeight: '600' }}>🗑️ Sil</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.cardBody}>
                  <View style={s.barRow}>
                    <Text style={[s.barLabel, { color: '#C9A84C' }]}>{isAB ? 'Sol' : 'Beğenildi'}</Text>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { width: `${pctA}%`, backgroundColor: '#C9A84C' }]} />
                    </View>
                    <Text style={s.barNum}>%{pctA}</Text>
                  </View>

                  <View style={s.barRow}>
                    <Text style={[s.barLabel, { color: '#7F77DD' }]}>{isAB ? 'Sağ' : 'Beğenilmedi'}</Text>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { width: `${pctB}%`, backgroundColor: '#7F77DD' }]} />
                    </View>
                    <Text style={s.barNum}>%{pctB}</Text>
                  </View>



                  {/* Yorumlar Listesi */}
                  {comments.length > 0 && (
                    <View style={s.commentsSection}>
                      <Text style={s.commentsHeader}>GELEN YORUMLAR ({comments.length})</Text>
                      {comments.map(c => (
                        <View key={c.id || Math.random().toString()} style={s.commentItem}>
                          <Text style={s.commentText}>"{c.comment}"</Text>
                          <Text style={s.commentMeta}>
                            Oy: {c.selected_option === 'A' ? 'Foto A 🅰️' : c.selected_option === 'B' ? 'Foto B 🅱️' : 'Oy Verildi'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )
          })
        )}
      </ScrollView>

      {/* Full-Screen Pinch-to-Zoom Lightbox Modal */}
      {!!zoomUri && (
        <Modal visible={true} transparent animationType="fade" onRequestClose={() => setZoomUri(null)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}
            activeOpacity={1}
            onPress={() => setZoomUri(null)}
          >
            <TouchableOpacity
              style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.2)', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => setZoomUri(null)}
            >
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>

            <ScrollView
              key={zoomKey.toString()}
              style={{ width: '100%', height: '100%' }}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}
              maximumZoomScale={4}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              bouncesZoom={false}
            >
              <Image
                source={{ uri: zoomUri }}
                style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.8 }}
                resizeMode="contain"
              />
            </ScrollView>

            <TouchableOpacity
              style={{ position: 'absolute', bottom: 40, backgroundColor: theme.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 }}
              onPress={() => setZoomUri(null)}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Kapat</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </SafeAreaView>
  )
}
