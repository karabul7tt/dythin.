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
import { Ionicons } from '@expo/vector-icons'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { sanitizeInput } from '../../lib/security'
import type { Profile, Message } from '../../lib/types'
import { sendPushNotificationToUser } from '../../lib/notifications'
import ZoomablePhoto from '../../components/ZoomablePhoto'

export default function ChatScreen() {
  const { theme, session, t } = useApp()
  const { friendId } = useLocalSearchParams<{ friendId: string }>()
  const router = useRouter()

  const [friendProfile, setFriendProfile] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null)
  const [photoCaption, setPhotoCaption] = useState('')
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

  function extractPhotoUrl(msg: Message): string | null {
    if (msg.image_url) return msg.image_url
    if (msg.content?.startsWith('[PHOTO]:')) {
      const parts = msg.content.split('\n')
      return parts[0].replace('[PHOTO]:', '').trim()
    }
    if (msg.content?.startsWith('https://') && msg.content?.includes('/storage/v1/object/public/posts/')) {
      return msg.content.trim()
    }
    return null
  }

  function extractTextContent(msg: Message): string {
    if (msg.content?.startsWith('[PHOTO]:')) {
      const parts = msg.content.split('\n')
      return parts.slice(1).join('\n').trim()
    }
    if (msg.content === 'Fotoğraf' && msg.image_url) {
      return ''
    }
    return msg.content || ''
  }

  function handlePickImage() {
    if (uploadingImage || sending || !session?.user.id || !friendId) return

    Alert.alert(
      t('chat.addPhoto'),
      t('chat.optionsPrompt', { name: friendProfile?.username || '' }),
      [
        {
          text: t('chat.takePhoto'),
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync()
            if (status !== 'granted') {
              Alert.alert(t('chat.camPermTitle'), t('chat.camPermMsg'))
              return
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.8,
            })
            if (!result.canceled && result.assets[0]) {
              setPendingPhotoUri(result.assets[0].uri)
              setPhotoCaption('')
            }
          },
        },
        {
          text: t('chat.chooseGallery'),
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
            if (status !== 'granted') {
              Alert.alert(t('chat.galleryPermTitle'), t('chat.galleryPermMsg'))
              return
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.8,
            })
            if (!result.canceled && result.assets[0]) {
              setPendingPhotoUri(result.assets[0].uri)
              setPhotoCaption('')
            }
          },
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    )
  }

  async function handleSendPendingPhoto() {
    if (!pendingPhotoUri || !session?.user.id || !friendId || uploadingImage) return

    setUploadingImage(true)
    const targetUri = pendingPhotoUri
    const targetCaption = photoCaption.trim()
    setPendingPhotoUri(null)
    setPhotoCaption('')

    try {
      const ext = targetUri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg'
      const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
      const fileName = `dm_${session.user.id}_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`

      const res = await fetch(targetUri)
      const arrayBuffer = await res.arrayBuffer()

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('posts')
        .upload(fileName, arrayBuffer, {
          contentType,
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage
        .from('posts')
        .getPublicUrl(uploadData.path)

      const imageUrl = publicUrlData.publicUrl

      const newMsgPayload: any = {
        sender_id: session.user.id,
        receiver_id: friendId,
        content: targetCaption || 'Fotoğraf',
        image_url: imageUrl,
      }

      let insertRes = await supabase
        .from('messages')
        .insert(newMsgPayload)
        .select()

      if (insertRes.error) {
        const fallbackPayload = {
          sender_id: session.user.id,
          receiver_id: friendId,
          content: targetCaption ? `[PHOTO]:${imageUrl}\n${targetCaption}` : `[PHOTO]:${imageUrl}`,
        }
        insertRes = await supabase
          .from('messages')
          .insert(fallbackPayload)
          .select()
      }

      if (insertRes.error) {
        Alert.alert('Hata', 'Fotoğraf mesajı iletilemedi.')
      } else if (insertRes.data && insertRes.data[0]) {
        setMessages(prev => {
          if (prev.some(m => m.id === insertRes.data![0].id)) return prev
          return [...prev, insertRes.data![0] as Message]
        })
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)

        try {
          const { data: myProfile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', session.user.id)
            .single()
          const senderName = myProfile?.username ? `@${myProfile.username}` : 'Biri'
          sendPushNotificationToUser(
            friendId,
            `Yeni Fotoğraf: ${senderName}`,
            targetCaption ? targetCaption : 'Sana bir fotoğraf gönderdi.'
          ).catch(() => {})
        } catch {}
      }
    } catch (err: any) {
      Alert.alert('Fotoğraf Gönderilemedi', err.message || 'Lütfen tekrar deneyin.')
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

      try {
        const { data: myProfile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', session.user.id)
          .single()
        const senderName = myProfile?.username ? `@${myProfile.username}` : 'Biri'
        sendPushNotificationToUser(
          friendId,
          `Yeni Mesaj: ${senderName}`,
          cleanText
        ).catch(() => {})
      } catch {}
    }
  }

  function handleChatOptions() {
    Alert.alert(
      t('chat.optionsTitle'),
      t('chat.optionsPrompt', { name: friendProfile?.username || friendProfile?.full_name || 'kullanici' }),
      [
        {
          text: t('chat.reportOption'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('chat.reportTitle'),
              t('chat.reportMsg'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.ok'),
                  onPress: () => {
                    Alert.alert(t('chat.reportSent'), t('chat.reportSentMsg'))
                  },
                },
              ]
            )
          },
        },
        {
          text: t('chat.blockOption'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('chat.blockTitle'),
              t('chat.blockMsg'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.ok'),
                  style: 'destructive',
                  onPress: async () => {
                    if (!session?.user.id || !friendId) return
                    await supabase.from('blocked_users').insert({
                      blocker_id: session.user.id,
                      blocked_id: friendId,
                    })
                    Alert.alert(t('chat.blockedSuccess'), t('chat.blockedSuccessMsg'))
                    router.back()
                  },
                },
              ]
            )
          },
        },
        {
          text: t('chat.deleteOption'),
          style: 'destructive',
          onPress: handleDeleteChat,
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    )
  }

  function handleDeleteChat() {
    Alert.alert(
      t('chat.clearChatTitle'),
      t('chat.clearChatMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.ok'),
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
              Alert.alert(t('common.error'), t('messages.deleteChatError'))
            } else {
              setMessages([])
              Alert.alert(t('chat.chatCleared'), t('chat.chatClearedMsg'))
            }
          },
        },
      ]
    )
  }

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

  const readReceiptColor = theme.accentText || theme.accent || '#38BDF8'

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
    backBtn: { paddingRight: 10, paddingVertical: 4 },
    avatar: { width: 38, height: 38, borderRadius: 19, marginRight: 10 },
    avatarPlaceholder: {
      width: 38,
      height: 38,
      borderRadius: 19,
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
    headerActionBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    chatList: { flex: 1, paddingHorizontal: 14, paddingVertical: 12 },
    
    bubbleRowMine: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 },
    bubbleRowOther: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 10 },
    
    bubbleMine: {
      maxWidth: '82%',
      backgroundColor: theme.accent,
      borderRadius: 18,
      borderBottomRightRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 10,
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

    photoBubbleStandalone: {
      borderRadius: 18,
      overflow: 'hidden',
      position: 'relative',
      maxWidth: 240,
    },
    photoStandaloneImage: {
      width: 240,
      height: 290,
      borderRadius: 18,
      backgroundColor: '#1a1a24',
    },
    photoTimestampOverlay: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },

    msgTextMine: { color: '#ffffff', fontSize: 14, lineHeight: 20 },
    msgTextOther: { color: theme.text, fontSize: 14, lineHeight: 20 },
    timeMine: { color: 'rgba(255, 255, 255, 0.75)', fontSize: 10, alignSelf: 'flex-end' },
    timeOther: { color: theme.textSub, fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },

    emptyText: { color: theme.textSub, fontSize: 13, textAlign: 'center', marginVertical: 40 },

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
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
            <Ionicons name="chevron-back" size={24} color={theme.text} />
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

          <TouchableOpacity
            style={s.headerActionBtn}
            onPress={handleChatOptions}
            activeOpacity={0.7}
            accessibilityLabel="Sohbet Seçenekleri ve Moderasyon"
          >
            <Ionicons name="ellipsis-vertical" size={18} color={theme.textSub} />
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
              <Text style={s.emptyText}>{t('chat.noMessagesYet')}</Text>
            ) : (
              messages.map(m => {
                const isMine = m.sender_id === session?.user.id
                const photoUrl = extractPhotoUrl(m)
                const textContent = extractTextContent(m)

                if (photoUrl && !textContent) {
                  return (
                    <TouchableOpacity
                      key={m.id || Math.random().toString()}
                      style={isMine ? s.bubbleRowMine : s.bubbleRowOther}
                      onLongPress={() => handleLongPressMessage(m)}
                      activeOpacity={0.92}
                    >
                      <TouchableOpacity
                        style={s.photoBubbleStandalone}
                        onPress={() => setSelectedPhotoModal(photoUrl)}
                        activeOpacity={0.88}
                      >
                        <Image
                          source={{ uri: photoUrl }}
                          style={s.photoStandaloneImage}
                          resizeMode="cover"
                        />
                        <View style={s.photoTimestampOverlay}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
                            {formatTime(m.created_at)}
                          </Text>
                          {isMine && (
                            <Ionicons
                              name={m.is_read ? 'checkmark-done' : 'checkmark'}
                              size={13}
                              color={m.is_read ? readReceiptColor : 'rgba(255, 255, 255, 0.8)'}
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  )
                }

                return (
                  <TouchableOpacity
                    key={m.id || Math.random().toString()}
                    style={isMine ? s.bubbleRowMine : s.bubbleRowOther}
                    onLongPress={() => handleLongPressMessage(m)}
                    activeOpacity={0.9}
                  >
                    <View style={isMine ? s.bubbleMine : s.bubbleOther}>
                      {!!photoUrl && (
                        <TouchableOpacity
                          style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 8 }}
                          onPress={() => setSelectedPhotoModal(photoUrl)}
                          activeOpacity={0.85}
                        >
                          <Image
                            source={{ uri: photoUrl }}
                            style={{ width: 220, height: 220, borderRadius: 14 }}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      )}

                      {!!textContent && (
                        <Text style={isMine ? s.msgTextMine : s.msgTextOther}>{textContent}</Text>
                      )}

                      {isMine ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 4, marginTop: 4 }}>
                          <Text style={s.timeMine}>{formatTime(m.created_at)}</Text>
                          {m.is_read ? (
                            <Ionicons name="checkmark-done" size={13} color={readReceiptColor} />
                          ) : (
                            <Ionicons name="checkmark" size={13} color="rgba(255, 255, 255, 0.65)" />
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
          <TouchableOpacity
            style={s.photoPickBtn}
            onPress={handlePickImage}
            disabled={uploadingImage || sending}
            activeOpacity={0.75}
          >
            {uploadingImage ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <Ionicons name="image-outline" size={20} color={theme.text} />
            )}
          </TouchableOpacity>

          <TextInput
            style={s.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={t('chat.inputPlaceholder')}
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
              <Ionicons name="send" size={18} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* INSTAGRAM DM TARZI FOTOĞRAF SEÇME & GÖNDERME ÖNİZLEME MODALI */}
      {pendingPhotoUri && (
        <Modal visible transparent animationType="slide">
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
            {/* Üst Kapat Butonu */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
              <TouchableOpacity
                onPress={() => setPendingPhotoUri(null)}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{t('chat.addPhoto')}</Text>
              <View style={{ width: 40 }} />
            </View>

            {/* Fotoğraf Önizleme */}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
              <Image
                source={{ uri: pendingPhotoUri }}
                style={{ width: '100%', height: '80%', borderRadius: 20 }}
                resizeMode="contain"
              />
            </View>

            {/* Alt Açıklama ve Gönder Çubuğu (Insta DM Style) */}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 12,
                backgroundColor: 'rgba(25, 25, 35, 0.95)',
                borderTopWidth: 0.5,
                borderTopColor: 'rgba(255,255,255,0.1)',
                gap: 10,
              }}>
                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    borderRadius: 22,
                    paddingHorizontal: 18,
                    paddingVertical: 12,
                    color: '#fff',
                    fontSize: 15,
                  }}
                  value={photoCaption}
                  onChangeText={setPhotoCaption}
                  placeholder={t('chat.inputPlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  returnKeyType="send"
                  onSubmitEditing={handleSendPendingPhoto}
                />

                <TouchableOpacity
                  onPress={handleSendPendingPhoto}
                  style={{
                    backgroundColor: theme.accent,
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="send" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      )}

      {/* Tam Ekran Fotoğraf Büyütme Modalı */}
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
