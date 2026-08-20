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
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { sanitizeInput } from '../../lib/security'
import type { Profile, Message } from '../../lib/types'

export default function ChatScreen() {
  const { theme, session } = useApp()
  const { friendId } = useLocalSearchParams<{ friendId: string }>()
  const router = useRouter()

  const [friendProfile, setFriendProfile] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const scrollViewRef = useRef<ScrollView>(null)

  useEffect(() => {
    if (friendId && session?.user.id) {
      fetchFriendProfile()
      fetchMessages()
      const unsubscribe = subscribeToMessages()
      return () => {
        unsubscribe?.()
      }
    }
  }, [friendId, session?.user.id])

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
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        payload => {
          const newMsg = payload.new as Message
          if (
            (newMsg.sender_id === session?.user.id && newMsg.receiver_id === friendId) ||
            (newMsg.sender_id === friendId && newMsg.receiver_id === session?.user.id)
          ) {
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })
            setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
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
      // Local optimistic append if realtime hasn't triggered yet
      setMessages(prev => {
        if (prev.some(m => m.id === data[0].id)) return prev
        return [...prev, data[0] as Message]
      })
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }

  function formatTime(iso: string) {
    if (!iso) return ''
    const d = new Date(iso)
    const hours = d.getHours().toString().padStart(2, '0')
    const mins = d.getMinutes().toString().padStart(2, '0')
    return `${hours}:${mins}`
  }

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

    chatList: { flex: 1, paddingHorizontal: 16, paddingVertical: 12 },
    
    // Bubble Styles
    bubbleRowMine: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 },
    bubbleRowOther: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 10 },
    
    bubbleMine: {
      maxWidth: '78%',
      backgroundColor: theme.accent,
      borderRadius: 16,
      borderBottomRightRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    bubbleOther: {
      maxWidth: '78%',
      backgroundColor: theme.card,
      borderWidth: 0.5,
      borderColor: theme.border,
      borderRadius: 16,
      borderBottomLeftRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },

    msgTextMine: { color: '#ffffff', fontSize: 14, lineHeight: 20 },
    msgTextOther: { color: theme.text, fontSize: 14, lineHeight: 20 },
    timeMine: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },
    timeOther: { color: theme.textSub, fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },

    emptyText: { color: theme.textSub, fontSize: 13, textAlign: 'center', marginVertical: 40 },

    // Input Bar
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 0.5,
      borderTopColor: theme.border,
      backgroundColor: theme.card,
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
      marginLeft: 10,
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
                  <View key={m.id || Math.random().toString()} style={isMine ? s.bubbleRowMine : s.bubbleRowOther}>
                    <View style={isMine ? s.bubbleMine : s.bubbleOther}>
                      <Text style={isMine ? s.msgTextMine : s.msgTextOther}>{m.content}</Text>
                      <Text style={isMine ? s.timeMine : s.timeOther}>{formatTime(m.created_at)}</Text>
                    </View>
                  </View>
                )
              })
            )}
          </ScrollView>
        )}

        {/* Input Bar */}
        <View style={s.inputRow}>
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
            disabled={sending || !inputText.trim()}
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
    </SafeAreaView>
  )
}
