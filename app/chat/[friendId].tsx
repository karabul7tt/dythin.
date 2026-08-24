import React, { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { sanitizeInput } from '../../lib/security'
import type { Profile, Message } from '../../lib/types'
import ZoomablePhoto from '../../components/ZoomablePhoto'

export default function ChatScreen() {
  const { theme, session } = useApp()
  const { friendId } = useLocalSearchParams<{ friendId: string }>()
  const router = useRouter()

  const [friendProfile, setFriendProfile] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<string | null>(null)
  const scrollViewRef = useRef<ScrollView>(null)

  useEffect(() => {
    if (friendId && session?.user.id) {
      fetchFriendProfile()
      fetchMessages()
      markAsRead()
      const unsubscribe = subscribeToMessages()
      return () => {
        unsubscribe?.()
      }
    }
  }, [friendId, session?.user.id])

  async function markAsRead() {
    if (!session?.user.id || !friendId) return
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('sender_id', friendId)
      .eq('receiver_id', session.user.id)
      .eq('is_read', false)
  }

  async function fetchFriendProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', friendId)
      .single()
    if (data) setFriendProfile(data as Profile)
  }

  async function fetchMessages() {
    if (!session?.user.id || !friendId) return
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${session.user.id})`)
      .order('created_at', { ascending: true })

    setMessages((data as Message[]) || [])
    setLoading(false)
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 200)
  }

  function subscribeToMessages() {
    const channelName = `chat_${session?.user.id}_${friendId}_${Math.random().toString(36).substring(7)}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        payload => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new as Message
            if (
              (newMsg.sender_id === session?.user.id && newMsg.receiver_id === friendId) ||
              (newMsg.sender_id === friendId && newMsg.receiver_id === session?.user.id)
            ) {
              setMessages(prev => {
                if (prev.some(m => m.id === newMsg.id)) return prev
                return [...prev, newMsg]
              })
              markAsRead()
              setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedMsg = payload.new as Message
            setMessages(prev => prev.map(m => (m.id === updatedMsg.id ? updatedMsg : m)))
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any)?.id
            if (deletedId) {
              setMessages(prev => prev.filter(m => m.id !== deletedId))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  // Fotoğraf Seçme ve DM'de Gönderme
  async function handlePickImage() {
    if (uploadingImage || sending || !session?.user.id || !friendId) return

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Fotoğraf gönderebilmek için galeri erişim izni vermelisiniz.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    })

    if (result.canceled || !result.assets[0]) return

    setUploadingImage(true)
    try {
      const asset = result.assets[0]
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg'
      const filePath = `chat/${session.user.id}_${Date.now()}.${ext}`

      // Fetch as blob
      const res = await fetch(asset.uri)
      const blob = await res.blob()

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(filePath, blob, {
          contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          upsert: true,
        })

      if (uploadError) {
        throw uploadError
      }

      const { data: publicUrlData } = supabase.storage
        .from('post-images')
        .getPublicUrl(filePath)

      const imageUrl = publicUrlData.publicUrl

      // Send message with image_url
      const newMsgPayload = {
        sender_id: session.user.id,
        receiver_id: friendId,
        content: inputText.trim() || '📷 Fotoğraf',
        image_url: imageUrl,
      }

      setInputText('')

      const { data, error } = await supabase
        .from('messages')
        .insert(newMsgPayload)
        .select()

      if (error) {
        Alert.alert('Hata', 'Fotoğraf mesajı iletilemedi.')
      } else if (data && data[0]) {
        setMessages(prev => {
          if (prev.some(m => m.id === data[0].id)) return prev
          return [...prev, data[0] as Message]
        })
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)
      }
    } catch (err: any) {
      Alert.alert('Fotoğraf Yüklenemedi', err.message || 'Lütfen tekrar deneyin.')
    } finally {
      setUploadingImage(false)
    }
  }

  async function sendMessage() {
    const cleanText = sanitizeInput(inputText)
    if (!cleanText || !session?.user.id || !friendId) return

    setSending(true)
    const newMsgPayload = {
      sender_id: session.user.id,
      receiver_id: friendId,
      content: cleanText,
    }

    setInputText('')

    const { data, error } = await supabase
      .from('messages')
      .insert(newMsgPayload)
      .select()

    setSending(false)

    if (error) {
      if (error.message.includes('messages') || error.code === '42P01') {
        Alert.alert('Mesajlaşma Servisi', 'Mesajınız gönderilemedi. Supabase veritabanında "messages" tablosunun oluşturulması gerekiyor.')
      } else {
        Alert.alert('Bilgi', 'Mesaj gönderilirken bir aksama oluştu, lütfen tekrar deneyin.')
      }
    } else if (data && data[0]) {
      setMessages(prev => {
        if (prev.some(m => m.id === data[0].id)) return prev
        return [...prev, data[0] as Message]
      })
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }

  // Tüm Sohbeti Silme
  function handleDeleteChat() {
    Alert.alert(
      'Sohbeti Sil',
      'Bu kişiyle olan tüm mesajlaşma geçmişiniz silinecek. Emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sohbeti Sil',
          style: 'destructive',
          onPress: async () => {
            if (!session?.user.id || !friendId) return
            setLoading(true)
            const { error } = await supabase
              .from('messages')
              .delete()
              .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${session.user.id})`)

            setLoading(false)
            if (error) {
              Alert.alert('Hata', 'Sohbet silinemedi.')
            } else {
              setMessages([])
              Alert.alert('Sohbet Silindi', 'Mesaj geçmişi temizlendi.')
            }
          },
        },
      ]
    )
  }

  // Tek Mesajı Silme
  function handleLongPressMessage(msg: Message) {
    if (msg.sender_id !== session?.user.id) return

    Alert.alert(
      'Mesajı Sil',
      'Bu mesajı silmek istiyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Mesajı Sil',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('messages')
              .delete()
              .eq('id', msg.id)
            if (!error) {
              setMessages(prev => prev.filter(m => m.id !== msg.id))
            }
          },
        },
      ]
    )
  }

  function formatTime(iso: string) {
    if (!iso) return ''
    const d = new Date(iso)
    const hours = d.getHours().toString().padStart(2, '0')
    const mins = d.getMinutes().toString().padStart(2, '0')
    return `${hours}:${mins}`
  }

  // Aktif temaya göre okundu çift tik rengi
  const readReceiptColor = theme.accentText || theme.accent || '#6EE7B7'

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
      backgroundColor: theme.card,
    },
    backBtn: { paddingRight: 12, paddingVertical: 4 },
    backText: { fontSize: 20, color: theme.text },
    avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
    avatarPlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    headerInfo: { flex: 1 },
    friendName: { fontSize: 15, fontWeight: '700', color: theme.text },
    handleText: { fontSize: 11, color: theme.textSub },
    headerActionBtn: { padding: 8, borderRadius: 10 },

    chatList: { flex: 1, paddingHorizontal: 16, paddingVertical: 12 },
    
    // Bubble Styles
    bubbleRowMine: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
    bubbleRowOther: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 12 },
    
    bubbleMine: {
      maxWidth: '82%',
      backgroundColor: theme.accent,
      borderRadius: 18,
      borderBottomRightRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
      elevation: 2,
    },
    bubbleOther: {
      maxWidth: '82%',
      backgroundColor: theme.card,
      borderWidth: 0.5,
      borderColor: theme.border,
      borderRadius: 18,
      borderBottomLeftRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },

    msgImageContainer: {
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 6,
      backgroundColor: 'rgba(0,0,0,0.2)',
    },
    msgImage: {
      width: 220,
      height: 220,
      borderRadius: 12,
    },

    msgTextMine: { color: '#ffffff', fontSize: 14, lineHeight: 20 },
    msgTextOther: { color: theme.text, fontSize: 14, lineHeight: 20 },
    timeMine: { color: 'rgba(255, 255, 255, 0.75)', fontSize: 10, alignSelf: 'flex-end' },
    timeOther: { color: theme.textSub, fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },

    emptyText: { color: theme.textSub, fontSize: 13, textAlign: 'center', marginVertical: 40 },

    // Input Bar
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderTopWidth: 0.5,
      borderTopColor: theme.border,
      backgroundColor: theme.card,
      gap: 8,
    },
    photoPickBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.bg,
      borderWidth: 0.5,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      flex: 1,
      backgroundColor: theme.bg,
      borderWidth: 0.5,
      borderColor: theme.border,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 14,
      color: theme.text,
      maxHeight: 100,
    },
    sendBtn: {
      backgroundColor: theme.accent,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  })

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backText}>←</Text>
          </TouchableOpacity>

          {friendProfile?.avatar_url ? (
            <Image source={{ uri: friendProfile.avatar_url }} style={s.avatar} />
          ) : (
            <View style={s.avatarPlaceholder}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.textSub }}>
                {(friendProfile?.username || 'D')[0].toUpperCase()}
              </Text>
            </View>
          )}

          <View style={s.headerInfo}>
            <Text style={s.friendName}>{friendProfile?.full_name || friendProfile?.username || 'Kullanıcı'}</Text>
            <Text style={s.handleText}>@{friendProfile?.username || 'kullanici'}</Text>
          </View>

          {/* Sohbeti Sil / Temizle Butonu */}
          <TouchableOpacity style={s.headerActionBtn} onPress={handleDeleteChat} activeOpacity={0.7}>
            <Text style={{ fontSize: 18, color: '#f87171' }}>🗑️</Text>
          </TouchableOpacity>
        </View>

        {/* Message List */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            style={s.chatList}
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 ? (
              <Text style={s.emptyText}>Henüz mesajınız yok. İlk mesajı siz gönderin!</Text>
            ) : (
              messages.map(m => {
                const isMine = m.sender_id === session?.user.id
                return (
                  <TouchableOpacity
                    key={m.id || Math.random().toString()}
                    style={isMine ? s.bubbleRowMine : s.bubbleRowOther}
                    onLongPress={() => handleLongPressMessage(m)}
                    activeOpacity={0.9}
                  >
                    <View style={isMine ? s.bubbleMine : s.bubbleOther}>
                      {/* Fotoğraf Mesajı Varsa */}
                      {!!m.image_url && (
                        <TouchableOpacity
                          style={s.msgImageContainer}
                          onPress={() => setSelectedPhotoModal(m.image_url!)}
                          activeOpacity={0.85}
                        >
                          <Image
                            source={{ uri: m.image_url }}
                            style={s.msgImage}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      )}

                      {/* Metin İçeriği */}
                      {(!m.image_url || (m.content && m.content !== '📷 Fotoğraf')) && (
                        <Text style={isMine ? s.msgTextMine : s.msgTextOther}>{m.content}</Text>
                      )}

                      {isMine ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 4, marginTop: 4 }}>
                          <Text style={s.timeMine}>{formatTime(m.created_at)}</Text>
                          {m.is_read ? (
                            <Text style={{ color: readReceiptColor, fontSize: 12, fontWeight: '900' }}>✓✓</Text>
                          ) : (
                            <Text style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: 12, fontWeight: '700' }}>✓✓</Text>
                          )}
                        </View>
                      ) : (
                        <Text style={s.timeOther}>{formatTime(m.created_at)}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                )
              })
            )}
          </ScrollView>
        )}

        {/* Input Bar */}
        <View style={s.inputRow}>
          {/* Fotoğraf Ekleme Butonu */}
          <TouchableOpacity
            style={s.photoPickBtn}
            onPress={handlePickImage}
            disabled={uploadingImage || sending}
            activeOpacity={0.75}
          >
            {uploadingImage ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <Text style={{ fontSize: 18 }}>📷</Text>
            )}
          </TouchableOpacity>

          <TextInput
            style={s.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Mesaj yazın..."
            placeholderTextColor={theme.textSub}
            multiline
            returnKeyType="default"
          />

          <TouchableOpacity
            style={s.sendBtn}
            onPress={sendMessage}
            disabled={sending || (!inputText.trim() && !uploadingImage)}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={s.sendBtnText}>Gönder</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Fotoğraf Büyütme Modalı */}
      {selectedPhotoModal && (
        <Modal visible transparent animationType="fade">
          <ZoomablePhoto
            uri={selectedPhotoModal}
            accentColor={theme.accent}
            onClose={() => setSelectedPhotoModal(null)}
          />
        </Modal>
      )}
    </SafeAreaView>
  )
}
