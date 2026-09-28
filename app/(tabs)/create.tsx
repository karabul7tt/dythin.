import { useState } from 'react'
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
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { getCleanErrorMessage } from '../../lib/errors'
import { sanitizeInput } from '../../lib/security'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import CustomRefreshContainer from '../../components/CustomRefreshContainer'

export default function ShareScreen() {
  const { theme, session, t } = useApp()
  const router = useRouter()
  const isDark = theme.bg === '#0e0e1a' || theme.bg === '#111108'
  const refreshColor = isDark ? '#ffffff' : '#555555'
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [imageA, setImageA] = useState<string | null>(null)
  const [imageB, setImageB] = useState<string | null>(null)
  const [isAB, setIsAB] = useState(false)
  const [audience, setAudience] = useState<'public' | 'friends'>('public')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    setTitle('')
    setDescription('')
    setImageA(null)
    setImageB(null)
    setIsAB(false)
    setTimeout(() => setRefreshing(false), 650)
  }

  const [lastPostTime, setLastPostTime] = useState<number>(0)

  function pickImage(setImage: (uri: string | null) => void) {
    Alert.alert(
      'Fotoğraf Ekle',
      'Bir yöntem seçin',
      [
        {
          text: 'Fotoğraf Çek (Kamera)',
          onPress: async () => {
            const permission = await ImagePicker.requestCameraPermissionsAsync()
            if (!permission.granted) {
              Alert.alert('Kamera İzni Gerekli', 'Fotoğraf çekebilmek için kameraya izin vermeniz gerekmektedir.')
              return
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.7,
            })
            if (!result.canceled && result.assets[0]) setImage(result.assets[0].uri)
          },
        },
        {
          text: 'Galeriden Seç',
          onPress: async () => {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
            if (!permission.granted) {
              Alert.alert('Fotoğraf İzni Gerekli', 'Fotoğraf seçebilmek için galeriye izin vermeniz gerekmektedir.')
              return
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.7,
            })
            if (!result.canceled && result.assets[0]) setImage(result.assets[0].uri)
          },
        },
        { text: 'Vazgeç', style: 'cancel' },
      ]
    )
  }

  async function uploadImage(uri: string) {
    if (!session?.user.id) throw new Error('Fotoğraf yüklemek için giriş yapmalısınız.')
    const response = await fetch(uri)
    const file = await response.arrayBuffer()
    
    // Yükleme Boyutu Sınırı: Maksimum 5 MB
    const MAX_SIZE_BYTES = 5 * 1024 * 1024
    if (file.byteLength > MAX_SIZE_BYTES) {
      throw new Error("Fotoğraf boyutu 5 MB'tan büyük olamaz. Lütfen daha küçük bir resim seçin.")
    }

    const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg'
    const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
    const fileName = `${session.user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
    const { data, error } = await supabase.storage.from('posts').upload(fileName, file, {
      contentType,
      upsert: false,
    })
    if (error) throw error
    const { data: urlData } = supabase.storage.from('posts').getPublicUrl(data.path)
    return urlData.publicUrl
  }

  async function handleSubmit() {
    // 1. Yükleme Sıklığı Sınırı (Rate Limiting): 30 saniyede en fazla 1 gönderi
    const now = Date.now()
    if (now - lastPostTime < 30000) {
      const remainingSec = Math.ceil((30000 - (now - lastPostTime)) / 1000)
      return Alert.alert(
        'Yükleme Sınırı',
        `Yeni bir oylama paylaşabilmek için lütfen ${remainingSec} saniye bekleyin.`
      )
    }

    // 2. Girdi Doğrulama & XSS Kaçırma (Input Validation & XSS Sanitization)
    const cleanTitle = sanitizeInput(title)
    const cleanDesc = sanitizeInput(description)

    if (!cleanTitle || !imageA) {
      return Alert.alert('Eksik Bilgi', 'Başlık ve en az 1 fotoğraf seçimi zorunludur.')
    }
    if (cleanTitle.length > 100) {
      return Alert.alert('Başlık Çok Uzun', 'Başlık en fazla 100 karakter olabilir.')
    }
    if (cleanDesc.length > 300) {
      return Alert.alert('Açıklama Çok Uzun', 'Açıklama en fazla 300 karakter olabilir.')
    }
    if (isAB && !imageB) {
      return Alert.alert('Eksik Fotoğraf', 'A/B karşılaştırması için 2. fotoğrafı da seçmelisiniz.')
    }

    setLoading(true)
    try {
      const urlA = await uploadImage(imageA)
      let urlB: string | null = null
      if (isAB && imageB) {
        urlB = await uploadImage(imageB)
      }

      // Default 24 hours expiration time
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

      const postPayload: any = {
        user_id: session?.user.id,
        title: cleanTitle,
        description: cleanDesc || null,
        image_a_url: urlA,
        image_url: urlA,
        audience,
        is_active: true,
      }
      if (urlB) postPayload.image_b_url = urlB
      postPayload.expires_at = expiresAt

      let { error } = await supabase.from('posts').insert(postPayload)

      // Fallback if image_a_url column does not exist in remote DB schema
      if (error && (error.message.includes('image_a_url') || error.code === 'PGRST204')) {
        delete postPayload.image_a_url
        const res = await supabase.from('posts').insert(postPayload)
        error = res.error
      }

      // Fallback if expires_at column does not exist in remote DB schema
      if (error && (error.message.includes('expires_at') || error.code === 'PGRST204')) {
        delete postPayload.expires_at
        const res = await supabase.from('posts').insert(postPayload)
        error = res.error
      }

      // Fallback if image_b_url column does not exist in remote DB schema
      if (error && (error.message.includes('image_b_url') || error.code === 'PGRST204')) {
        delete postPayload.image_b_url
        const res = await supabase.from('posts').insert(postPayload)
        error = res.error
      }

      if (error) throw error

      setLastPostTime(Date.now())

      Alert.alert(
        'Paylaşıldı',
        'Gönderiniz oylamaya açıldı. Kendi gönderinizi Sonuçlar sayfasından takip edebilirsiniz.'
      )
      setTitle('')
      setDescription('')
      setImageA(null)
      setImageB(null)
      setIsAB(false)
      setAudience('public')

      // Redirect to Results screen to view newly created post
      router.replace('/(tabs)/results')
    } catch (e: any) {
      Alert.alert('Hata', getCleanErrorMessage(e, 'Gönderi oluşturulamadı.'))
    }
    setLoading(false)
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 20 },
    logo: { fontSize: 24, fontWeight: '700', color: theme.text, marginTop: 0, marginBottom: 14 },
    logoDot: { color: theme.accent },
    uploadZone: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.accent,
      borderRadius: 16,
      padding: 20,
      alignItems: 'center',
      backgroundColor: theme.accentLight,
      marginBottom: 12,
    },
    uploadText: { color: theme.accent, fontWeight: '500', fontSize: 13, marginTop: 4 },
    previewImg: { width: '100%', height: 180, borderRadius: 12, marginBottom: 12 },
    abRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    abBox: { flex: 1 },
    label: { fontSize: 11, color: theme.textSub, marginBottom: 6, fontWeight: '600', letterSpacing: 0.4 },
    input: {
      backgroundColor: theme.card,
      borderWidth: 0.5,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 13,
      color: theme.text,
      marginBottom: 14,
    },
    toggleBtn: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      marginBottom: 16,
    },
    toggleBtnActive: { borderColor: theme.accent, backgroundColor: theme.accentLight },
    toggleText: { fontSize: 12, color: theme.textSub, fontWeight: '600' },
    toggleTextActive: { color: theme.accent },
    audienceRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    audienceBtn: {
      flex: 1,
      padding: 12,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    audienceBtnActive: { borderColor: theme.accent, backgroundColor: theme.accentLight },
    audienceBtnText: { fontSize: 12, color: theme.textSub, fontWeight: '500' },
    audienceBtnTextActive: { color: theme.accent },
    btn: { backgroundColor: theme.accent, borderRadius: 14, padding: 15, alignItems: 'center' },
    btnText: { color: theme.bg, fontSize: 14, fontWeight: '600' },
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
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 180 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshing={refreshing}
          onRefresh={handleRefresh}
        >
          <Text style={s.logo}>
            dythin<Text style={s.logoDot}>.</Text>
          </Text>

        <Text style={s.label}>FOTOĞRAF SEÇİMİ</Text>

        <TouchableOpacity
          style={[s.toggleBtn, isAB && s.toggleBtnActive, { flexDirection: 'row', justifyContent: 'center', gap: 8 }]}
          onPress={() => setIsAB(!isAB)}
        >
          <Ionicons
            name={isAB ? 'checkmark-circle' : 'add-circle-outline'}
            size={18}
            color={isAB ? theme.accent : theme.textSub}
          />
          <Text style={[s.toggleText, isAB && s.toggleTextActive]}>
            {isAB ? 'A/B Karşılaştırma Modu (2 Fotoğraf)' : 'A/B Karşılaştırma Fotoğrafı Ekle'}
          </Text>
        </TouchableOpacity>

        {!isAB ? (
          imageA ? (
            <TouchableOpacity onPress={() => pickImage(setImageA)}>
              <Image source={{ uri: imageA }} style={s.previewImg} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.uploadZone} onPress={() => pickImage(setImageA)}>
              <Ionicons name="camera-outline" size={34} color={theme.accent} />
              <Text style={s.uploadText}>Fotoğraf Seç</Text>
            </TouchableOpacity>
          )
        ) : (
          <View style={s.abRow}>
            <View style={s.abBox}>
              <Text style={s.label}>SOL FOTOĞRAF (A)</Text>
              {imageA ? (
                <TouchableOpacity onPress={() => pickImage(setImageA)}>
                  <Image source={{ uri: imageA }} style={s.previewImg} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={s.uploadZone} onPress={() => pickImage(setImageA)}>
                  <Ionicons name="image-outline" size={28} color={theme.accent} />
                  <Text style={s.uploadText}>Sol Fotoğrafı Seç</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={s.abBox}>
              <Text style={s.label}>SAĞ FOTOĞRAF (B)</Text>
              {imageB ? (
                <TouchableOpacity onPress={() => pickImage(setImageB)}>
                  <Image source={{ uri: imageB }} style={s.previewImg} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={s.uploadZone} onPress={() => pickImage(setImageB)}>
                  <Ionicons name="image-outline" size={28} color={theme.accent} />
                  <Text style={s.uploadText}>Sağ Fotoğrafı Seç</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <Text style={s.label}>{t('create.header').toUpperCase()}</Text>
        <TextInput
          style={s.input}
          value={title}
          onChangeText={setTitle}
          placeholder={t('create.titlePlaceholder')}
          placeholderTextColor={theme.textSub}
          returnKeyType="done"
          blurOnSubmit={true}
          onSubmitEditing={Keyboard.dismiss}
        />

        <Text style={s.label}>AÇIKLAMA</Text>
        <TextInput
          style={[s.input, { height: 70 }]}
          value={description}
          onChangeText={setDescription}
          placeholder="..."
          placeholderTextColor={theme.textSub}
          multiline
          returnKeyType="done"
          blurOnSubmit={true}
          onSubmitEditing={Keyboard.dismiss}
        />

        <Text style={s.label}>KİM OYLASIN?</Text>
        <View style={s.audienceRow}>
          <TouchableOpacity
            style={[s.audienceBtn, audience === 'public' && s.audienceBtnActive, { flexDirection: 'row', justifyContent: 'center', gap: 6 }]}
            onPress={() => setAudience('public')}
          >
            <Ionicons
              name="globe-outline"
              size={15}
              color={audience === 'public' ? theme.accent : theme.textSub}
            />
            <Text style={[s.audienceBtnText, audience === 'public' && s.audienceBtnTextActive]}>
              {t('settings.everyone')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.audienceBtn, audience === 'friends' && s.audienceBtnActive, { flexDirection: 'row', justifyContent: 'center', gap: 6 }]}
            onPress={() => setAudience('friends')}
          >
            <Ionicons
              name="people-outline"
              size={15}
              color={audience === 'friends' ? theme.accent : theme.textSub}
            />
            <Text style={[s.audienceBtnText, audience === 'friends' && s.audienceBtnTextActive]}>
              {t('settings.onlyFriends')}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.btn} onPress={handleSubmit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={theme.bg} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Text style={s.btnText}>{t('create.publishBtn')}</Text>
              <Ionicons name="arrow-forward" size={16} color={theme.bg} />
            </View>
          )}
        </TouchableOpacity>
        </CustomRefreshContainer>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
