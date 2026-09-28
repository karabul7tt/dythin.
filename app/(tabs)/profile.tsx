import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  Alert,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect } from '@react-navigation/native'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { getCleanErrorMessage } from '../../lib/errors'
import { sanitizeInput, validateInstagramUsername } from '../../lib/security'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import CustomRefreshContainer from '../../components/CustomRefreshContainer'
import ZoomablePhoto from '../../components/ZoomablePhoto'
import { extractUserProfile, syncUserProfileWithDatabase } from '../../lib/authHelper'
import { sendPushNotificationToUser } from '../../lib/notifications'
import type { Profile, FriendRecord, FriendshipWithProfiles } from '../../lib/types'

export default function ProfileScreen() {
  const { theme, session } = useApp()
  const userId = session?.user?.id
  const router = useRouter()
  const isDark = theme.bg === '#0e0e1a' || theme.bg === '#111108'
  const refreshColor = isDark ? '#ffffff' : '#555555'
  const [tab, setTab] = useState<'profile' | 'friends'>('profile')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [initialFullName, setInitialFullName] = useState('')
  const [initialUsername, setInitialUsername] = useState('')
  const [lastUsernameUpdate, setLastUsernameUpdate] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ posts: 0, votes: 0, friends: 0 })
  const [search, setSearch] = useState('')
  const [searchResult, setSearchResult] = useState<Profile | 'not_found' | null>(null)
  const [friends, setFriends] = useState<FriendRecord[]>([])
  const [requests, setRequests] = useState<FriendRecord[]>([])
  const [searching, setSearching] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
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

  function handleAvatarPress() {
    if (isEditing) {
      pickAvatar()
    } else if (avatar) {
      openZoom(avatar)
    } else {
      Alert.alert(
        'Profil Fotoğrafı Yok',
        'Profil fotoğrafı eklemek için düzenleme moduna geçebilirsiniz.',
        [
          { text: 'İptal', style: 'cancel' },
          { text: 'Düzenle', onPress: () => setIsEditing(true) },
        ]
      )
    }
  }

  useEffect(() => {
    if (!userId) return
    fetchProfile()
    fetchFriends()
  }, [userId])

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchProfile()
        fetchFriends()
      }
    }, [userId])
  )

  async function handleRefresh() {
    setRefreshing(true)
    const minDelay = new Promise(resolve => setTimeout(resolve, 600))
    await Promise.all([fetchProfile(), fetchFriends(), minDelay])
    setRefreshing(false)
  }

  async function fetchProfile() {
    if (!session?.user?.id) return
    let { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()

    if (!data) {
      data = await syncUserProfileWithDatabase(session.user)
    }

    if (data) {
      const prof = data as Profile
      const uName = prof.username || ''
      let fName = prof.full_name || ''
      let avUrl = prof.avatar_url || null

      const { name: gName, avatar: gAvatar } = extractUserProfile(session.user)

      let needsUpdate = false
      const updates: any = {}

      if ((!fName || fName === 'Kullanıcı' || fName.trim() === '') && gName) {
        fName = gName
        updates.full_name = gName
        needsUpdate = true
      }
      if ((!avUrl || avUrl.trim() === '') && gAvatar) {
        avUrl = gAvatar
        updates.avatar_url = gAvatar
        needsUpdate = true
      }
      if (needsUpdate) {
        Promise.resolve(supabase.from('profiles').update(updates).eq('id', session.user.id)).catch(() => null)
      }

      setUsername(uName)
      setFullName(fName)
      setInitialUsername(uName)
      setInitialFullName(fName)
      setAvatar(avUrl)
      setLastUsernameUpdate(prof.updated_at || null)
    }
    const { count: postCount } = await supabase
      .from('posts').select('*', { count: 'exact', head: true }).eq('user_id', session.user.id)
    const { count: voteCount } = await supabase
      .from('votes').select('*', { count: 'exact', head: true }).eq('voter_id', session.user.id)
    setStats(prev => ({ ...prev, posts: postCount || 0, votes: voteCount || 0 }))
  }

  async function fetchFriends() {
    const { data } = await supabase
      .from('friendships')
      .select(`
        *,
        requester:profiles!friendships_requester_id_fkey(id, username, avatar_url),
        receiver:profiles!friendships_receiver_id_fkey(id, username, avatar_url)
      `)
      .or(`requester_id.eq.${session?.user.id},receiver_id.eq.${session?.user.id}`)

    const rows = (data as FriendshipWithProfiles[]) || []

    const accepted: FriendRecord[] = rows
      .filter(f => f.status === 'accepted')
      .map(f => ({
        ...(f.requester_id === session?.user.id ? f.receiver : f.requester),
        friendship_id: f.id,
      }))

    const pending: FriendRecord[] = rows
      .filter(f => f.status === 'pending' && f.receiver_id === session?.user.id)
      .map(f => ({ ...f.requester, friendship_id: f.id }))

    setFriends(accepted)
    setRequests(pending)
    setStats(prev => ({ ...prev, friends: accepted.length }))
  }

  async function uploadAvatarUri(uri: string) {
    setLoading(true)
    try {
      if (!session?.user.id) throw new Error('Giriş yapmalısınız.')
      const response = await fetch(uri)
      const file = await response.arrayBuffer()
      const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg'
      const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
      const fileName = `${session.user.id}/avatar.${ext}`
      const { data, error } = await supabase.storage.from('posts').upload(fileName, file, { contentType, upsert: true })
      if (error) throw error
      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(data.path)
      setAvatar(urlData.publicUrl)
      await supabase.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', session?.user.id)
    } catch (e: unknown) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Fotoğraf yüklenemedi.')
    }
    setLoading(false)
  }

  function pickAvatar() {
    if (!isEditing) {
      Alert.alert('Bilgi', 'Profil fotoğrafınızı değiştirmek için önce "Düzenle" butonuna basın.')
      return
    }

    Alert.alert(
      'Profil Fotoğrafı Seç',
      'Bir yöntem seçin',
      [
        {
          text: 'Fotoğraf Çek (Kamera)',
          onPress: async () => {
            const permission = await ImagePicker.requestCameraPermissionsAsync()
            if (!permission.granted) {
              Alert.alert('Kamera İzni Gerekli', 'Fotoğraf çekebilmek için kameraya izin vermelisiniz.')
              return
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            })
            if (!result.canceled && result.assets[0]) {
              await uploadAvatarUri(result.assets[0].uri)
            }
          },
        },
        {
          text: 'Galeriden Seç',
          onPress: async () => {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
            if (!permission.granted) {
              Alert.alert('Fotoğraf İzni Gerekli', 'Profil fotoğrafı seçebilmek için galeri erişimine izin verin.')
              return
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            })
            if (!result.canceled && result.assets[0]) {
              await uploadAvatarUri(result.assets[0].uri)
            }
          },
        },
        { text: 'Vazgeç', style: 'cancel' },
      ]
    )
  }

  async function saveProfileInfo() {
    const cleanFullName = sanitizeInput(fullName)
    const usernameValidation = validateInstagramUsername(username)

    if (!usernameValidation.valid) {
      return Alert.alert('Geçersiz Kullanıcı Adı', usernameValidation.error)
    }

    const cleanUsername = usernameValidation.cleanUsername

    setLoading(true)
    try {
      if (!session?.user?.id) throw new Error('Oturum açmış kullanıcı bulunamadı.')

      const isUsernameChanged = cleanUsername.toLowerCase() !== initialUsername.toLowerCase()

      // 1. 14 Günlük Kullanıcı Adı Değiştirme Kuralı
      if (isUsernameChanged && lastUsernameUpdate) {
        const lastUpdate = new Date(lastUsernameUpdate).getTime()
        const now = new Date().getTime()
        const daysDiff = (now - lastUpdate) / (1000 * 3600 * 24)

        if (daysDiff < 14) {
          const remainingDays = Math.ceil(14 - daysDiff)
          setLoading(false)
          return Alert.alert(
            'Kullanıcı Adı Değiştirilemez',
            `Kullanıcı adınızı 14 günde bir değiştirebilirsiniz. Bir sonraki değiştirme hakkınız için ${remainingDays} gün beklemeniz gerekiyor.`
          )
        }
      }

      // 2. Benzersiz Kullanıcı Adı Denetimi (Case-Insensitive)
      if (isUsernameChanged) {
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', cleanUsername)
          .neq('id', session.user.id)
          .maybeSingle()

        if (existingUser) {
          setLoading(false)
          return Alert.alert(
            'Kullanıcı Adı Alınmış',
            'Bu kullanıcı adı başka bir üye tarafından kullanılıyor. Lütfen farklı bir kullanıcı adı seçin.'
          )
        }
      }

      const nowIso = new Date().toISOString()

      const updateData: Record<string, any> = {
        username: cleanUsername,
        full_name: cleanFullName,
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', session.user.id)

      if (error) {
        Alert.alert('Güncelleme Başarısız', getCleanErrorMessage(error))
      } else {
        setFullName(cleanFullName)
        setUsername(cleanUsername)
        setInitialFullName(cleanFullName)
        setInitialUsername(cleanUsername)
        if (isUsernameChanged) {
          setLastUsernameUpdate(nowIso)
          AsyncStorage.setItem(`last_username_update_${session.user.id}`, nowIso).catch(() => null)
        }
        setIsEditing(false)
        fetchProfile()
        Alert.alert('Başarılı', 'Profil bilgileriniz başarıyla güncellendi.')
      }
    } catch (e: any) {
      Alert.alert('Hata', getCleanErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  function cancelEdit() {
    setFullName(initialFullName)
    setUsername(initialUsername)
    setIsEditing(false)
  }

  async function searchUser() {
    if (!search.trim()) return
    setSearching(true)
    setSearchResult(null)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', search.trim())
      .neq('id', session?.user.id)
      .single()
    setSearchResult((data as Profile) || 'not_found')
    setSearching(false)
  }

  async function sendRequest(receiverId: string) {
    const { error } = await supabase.from('friendships').insert({
      requester_id: session?.user.id,
      receiver_id: receiverId,
    })
    if (error) {
      Alert.alert('Bilgi', 'İstek zaten gönderilmiş veya mevcut.')
    } else {
      Alert.alert('İstek Gönderildi')
      setSearchResult(null)
      setSearch('')

      // Karşı tarafa push bildirimi gönder
      if (receiverId) {
        try {
          const senderName = username ? `@${username}` : 'Biri'
          sendPushNotificationToUser(
            receiverId,
            'Arkadaşlık İsteği!',
            `${senderName} sana arkadaşlık isteği gönderdi.`
          )
        } catch {}
      }
    }
  }

  async function acceptRequest(friendshipId: string, requesterId?: string) {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    fetchFriends()
    if (requesterId) {
      try {
        const senderName = username ? `@${username}` : 'Biri'
        sendPushNotificationToUser(
          requesterId,
          'Arkadaşlık İsteği Kabul Edildi!',
          `${senderName} arkadaşlık isteğini kabul etti.`
        )
      } catch {}
    }
  }

  async function rejectRequest(friendshipId: string) {
    Alert.alert('İsteği Reddet', 'Arkadaşlık isteğini reddetmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('friendships').delete().eq('id', friendshipId)
          fetchFriends()
        },
      },
    ])
  }

  async function removeFriend(friendshipId: string) {
    Alert.alert('Arkadaşı Çıkar', 'Arkadaş listenizden çıkarmak istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Çıkar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('friendships').delete().eq('id', friendshipId)
          fetchFriends()
        },
      },
    ])
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { padding: 20 },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    logo: { fontSize: 26, fontWeight: '700', color: theme.text },
    logoDot: { color: theme.accent },
    settingsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.card, borderWidth: 0.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    
    // Modern Profile Hero Header Card
    heroCard: {
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 20,
      alignItems: 'center',
      marginBottom: 20,
      borderWidth: 0.5,
      borderColor: theme.border,
    },
    avatarContainer: {
      position: 'relative',
      marginBottom: 12,
    },
    avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: theme.accent },
    avatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: theme.bg, borderWidth: 2, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    cameraBadge: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      backgroundColor: theme.accent,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.card,
    },
    displayName: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 2 },
    handleText: { fontSize: 13, color: theme.textSub },

    // Stats Grid
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    statCard: { flex: 1, backgroundColor: theme.card, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', borderWidth: 0.5, borderColor: theme.border },
    statNum: { fontSize: 20, fontWeight: '700', color: theme.accent },
    statLabel: { fontSize: 11, color: theme.textSub, marginTop: 4 },

    // Segmented Tab Switcher
    tabRow: { flexDirection: 'row', backgroundColor: theme.card, borderRadius: 24, padding: 4, marginBottom: 20, borderWidth: 0.5, borderColor: theme.border },
    tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 20, alignItems: 'center' },
    tabBtnActive: { backgroundColor: theme.accent },
    tabText: { fontSize: 13, color: theme.textSub, fontWeight: '600' },
    tabTextActive: { color: theme.bg },

    // Form inputs
    formCard: { backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: theme.border, marginBottom: 16 },
    inputLabel: { fontSize: 11, color: theme.textSub, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 },
    input: { backgroundColor: theme.bg, borderWidth: 0.5, borderColor: theme.border, borderRadius: 12, padding: 14, fontSize: 14, color: theme.text, marginBottom: 14 },
    saveBtn: { backgroundColor: theme.accent, borderRadius: 14, padding: 14, alignItems: 'center' },
    saveBtnText: { color: theme.bg, fontSize: 14, fontWeight: '600' },

    // Friends Section
    searchRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    searchBtn: { backgroundColor: theme.accent, borderRadius: 14, paddingHorizontal: 18, justifyContent: 'center' },
    searchBtnText: { color: theme.bg, fontWeight: '600', fontSize: 13 },
    sectionLabel: { fontSize: 11, color: theme.textSub, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10, marginTop: 12 },
    friendCard: { backgroundColor: theme.card, borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 0.5, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 12 },
    friendAvatar: { width: 44, height: 44, borderRadius: 22 },
    friendAvatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' },
    friendName: { fontSize: 14, fontWeight: '600', color: theme.text, flex: 1 },
    acceptBtn: { backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    acceptBtnText: { color: theme.bg, fontSize: 12, fontWeight: '600' },
    rejectBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 0.5, borderColor: '#e55353' },
    rejectBtnText: { color: '#e55353', fontSize: 12, fontWeight: '500' },
    removeBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 0.5, borderColor: theme.border },
    removeBtnText: { color: theme.textSub, fontSize: 12 },
    addBtn: { backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    addBtnText: { color: theme.bg, fontSize: 12, fontWeight: '600' },
    empty: { color: theme.textSub, fontSize: 14, textAlign: 'center', padding: 24, lineHeight: 22 },
  })

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <CustomRefreshContainer
          style={s.scroll}
          contentContainerStyle={{ paddingBottom: 320 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshing={refreshing}
          onRefresh={handleRefresh}
        >
          <View style={s.topRow}>
            <Text style={s.logo}>dythin<Text style={s.logoDot}>.</Text></Text>
            <TouchableOpacity
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: theme.card,
                borderWidth: 0.5,
                borderColor: theme.border,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 2,
              }}
              onPress={() => router.push('/(tabs)/settings')}
              activeOpacity={0.75}
            >
              <Ionicons name="settings-outline" size={19} color={theme.text} />
            </TouchableOpacity>
          </View>

        {/* Profile Hero Header */}
        <View style={s.heroCard}>
          <TouchableOpacity style={s.avatarContainer} onPress={handleAvatarPress} activeOpacity={0.8}>
            {avatar
              ? <Image source={{ uri: avatar }} style={s.avatar} />
              : <View style={s.avatarPlaceholder}><Text style={{ fontSize: 24, fontWeight: '700', color: theme.textSub }}>{(username || 'D')[0].toUpperCase()}</Text></View>}
            {isEditing && (
              <View style={s.cameraBadge}>
                <Ionicons name="camera" size={13} color={theme.bg} />
              </View>
            )}
          </TouchableOpacity>
          {isEditing && (
            <TouchableOpacity
              style={{
                marginTop: 8,
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 14,
                backgroundColor: theme.card,
                borderWidth: 0.5,
                borderColor: theme.accent,
                alignSelf: 'center',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
              onPress={pickAvatar}
              activeOpacity={0.8}
            >
              <Ionicons name="camera-outline" size={15} color={theme.accent} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.accent }}>
                Fotoğrafı Değiştir
              </Text>
            </TouchableOpacity>
          )}
          <Text style={s.displayName}>{fullName || username || 'Kullanıcı'}</Text>
          <Text style={s.handleText}>@{username || 'kullanici'}</Text>
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

        {/* Tab Switcher */}
        <View style={s.tabRow}>
          <TouchableOpacity style={[s.tabBtn, tab === 'profile' && s.tabBtnActive]} onPress={() => setTab('profile')}>
            <Text style={[s.tabText, tab === 'profile' && s.tabTextActive]}>Profil Bilgileri</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tabBtn, tab === 'friends' && s.tabBtnActive]} onPress={() => setTab('friends')}>
            <Text style={[s.tabText, tab === 'friends' && s.tabTextActive]}>
              Arkadaşlar {requests.length > 0 ? `(${requests.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {tab === 'profile' ? (
          <View style={s.formCard}>
            {!isEditing ? (
              <TouchableOpacity style={s.saveBtn} onPress={() => setIsEditing(true)} activeOpacity={0.8}>
                <Text style={s.saveBtnText}>Düzenle</Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={s.inputLabel}>AD SOYAD</Text>
                <TextInput
                  style={s.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Ad Soyad"
                  placeholderTextColor={theme.textSub}
                  editable={!loading}
                  returnKeyType="next"
                  blurOnSubmit={false}
                />

                <Text style={s.inputLabel}>KULLANICI ADI</Text>
                <TextInput
                  style={s.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="kullanici_adi"
                  placeholderTextColor={theme.textSub}
                  autoCapitalize="none"
                  editable={!loading}
                  returnKeyType="done"
                  blurOnSubmit={true}
                  onSubmitEditing={Keyboard.dismiss}
                />

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <TouchableOpacity style={[s.saveBtn, { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border }]} onPress={cancelEdit} disabled={loading} activeOpacity={0.8}>
                    <Text style={[s.saveBtnText, { color: theme.textSub }]}>İptal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[s.saveBtn, { flex: 1.5 }]} onPress={saveProfileInfo} disabled={loading} activeOpacity={0.8}>
                    {loading ? <ActivityIndicator color={theme.bg} /> : <Text style={s.saveBtnText}>Kaydet</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        ) : (
          <>
            {/* Kullanıcı arama */}
            <View style={s.searchRow}>
              <TextInput
                style={[s.input, { flex: 1, marginBottom: 0 }]}
                value={search}
                onChangeText={setSearch}
                placeholder="Kullanıcı adı ara..."
                placeholderTextColor={theme.textSub}
                autoCapitalize="none"
                returnKeyType="search"
                blurOnSubmit={true}
                onSubmitEditing={searchUser}
              />
              <TouchableOpacity style={s.searchBtn} onPress={searchUser} disabled={searching} activeOpacity={0.8}>
                {searching ? <ActivityIndicator color={theme.bg} size="small" /> : <Text style={s.searchBtnText}>Ara</Text>}
              </TouchableOpacity>
            </View>

            {searchResult && searchResult !== 'not_found' && (
              <TouchableOpacity
                style={s.friendCard}
                onPress={() => router.push({ pathname: '/user-profile', params: { userId: (searchResult as Profile).id } })}
                activeOpacity={0.8}
              >
                {searchResult.avatar_url
                  ? <Image source={{ uri: searchResult.avatar_url }} style={s.friendAvatar} />
                  : <View style={s.friendAvatarPlaceholder}><Text style={{ fontSize: 16, fontWeight: '700', color: theme.textSub }}>{searchResult.username[0].toUpperCase()}</Text></View>}
                <Text style={s.friendName}>{searchResult.username}</Text>
                <TouchableOpacity style={s.addBtn} onPress={() => sendRequest((searchResult as Profile).id)}>
                  <Text style={s.addBtnText}>+ Ekle</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
            {searchResult === 'not_found' && <Text style={s.empty}>Aradığınız kullanıcı bulunamadı</Text>}

            {/* Bekleyen istekler */}
            {requests.length > 0 && (
              <>
                <Text style={s.sectionLabel}>ARKADAŞLIK İSTEKLERİ</Text>
                {requests.map(r => (
                  <TouchableOpacity
                    key={r.friendship_id}
                    style={s.friendCard}
                    onPress={() => router.push({ pathname: '/user-profile', params: { userId: r.id } })}
                    activeOpacity={0.8}
                  >
                    {r.avatar_url
                      ? <Image source={{ uri: r.avatar_url }} style={s.friendAvatar} />
                      : <View style={s.friendAvatarPlaceholder}><Text style={{ fontSize: 16, fontWeight: '700', color: theme.textSub }}>{r.username[0].toUpperCase()}</Text></View>}
                    <Text style={s.friendName}>{r.username}</Text>
                    <TouchableOpacity style={s.rejectBtn} onPress={() => rejectRequest(r.friendship_id)}>
                      <Text style={s.rejectBtnText}>Reddet</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.acceptBtn} onPress={() => acceptRequest(r.friendship_id, r.id)}>
                      <Text style={s.acceptBtnText}>Kabul Et</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* Arkadaş listesi */}
            <Text style={s.sectionLabel}>ARKADAŞLARIM ({friends.length})</Text>
            {friends.length === 0 ? (
              <Text style={s.empty}>Henüz listenizde arkadaşınız yok.{'\n'}Kullanıcı adıyla arayıp arkadaş ekleyebilirsiniz!</Text>
            ) : friends.map(f => (
              <TouchableOpacity
                key={f.friendship_id}
                style={s.friendCard}
                onPress={() => router.push({ pathname: '/user-profile', params: { userId: f.id } })}
                activeOpacity={0.8}
              >
                {f.avatar_url
                  ? <Image source={{ uri: f.avatar_url }} style={s.friendAvatar} />
                  : <View style={s.friendAvatarPlaceholder}><Text style={{ fontSize: 16, fontWeight: '700', color: theme.textSub }}>{f.username[0].toUpperCase()}</Text></View>}
                <Text style={s.friendName}>{f.username}</Text>
                <TouchableOpacity
                  style={[s.acceptBtn, { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6 }]}
                  onPress={() => router.push({ pathname: '/chat/[friendId]', params: { friendId: f.id } })}
                >
                  <Ionicons name="chatbubbles-outline" size={13} color={theme.bg} />
                  <Text style={s.acceptBtnText}>Mesaj</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.removeBtn} onPress={() => removeFriend(f.friendship_id)}>
                  <Text style={s.removeBtnText}>Çıkar</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </>
        )}
        </CustomRefreshContainer>
      </KeyboardAvoidingView>

      {/* Full-Screen Zoomable Profile Photo Modal */}
      <Modal
        visible={zoomMounted}
        transparent={false}
        animationType="fade"
        onRequestClose={closeZoom}
      >
        {zoomMounted && zoomUri ? (
          <ZoomablePhoto
            uri={zoomUri}
            accentColor={theme.accent}
            onClose={closeZoom}
          />
        ) : null}
      </Modal>
    </SafeAreaView>
  )
}
