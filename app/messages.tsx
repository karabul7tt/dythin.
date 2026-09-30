import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import type { Profile, Message } from '../lib/types'

type ChatItem = {
  friend: Profile
  lastMessage: Message
}

export default function MessagesInboxScreen() {
  const { theme, session } = useApp()
  const router = useRouter()
  const isDark = theme.bg === '#0e0e1a' || theme.bg === '#111108'
  const refreshColor = isDark ? '#ffffff' : '#555555'
  const [chats, setChats] = useState<ChatItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session?.user.id) {
      fetchConversations()
    }
  }, [session?.user.id])

  async function fetchConversations() {
    setLoading(true)
    const userId = session?.user.id
    if (!userId) return

    const { data: rawMessages } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false })

    if (!rawMessages || rawMessages.length === 0) {
      setChats([])
      setLoading(false)
      return
    }

    const friendMap: { [friendId: string]: Message } = {}
    rawMessages.forEach(msg => {
      const friendId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id
      if (!friendMap[friendId]) {
        friendMap[friendId] = msg as Message
      }
    })

    const friendIds = Object.keys(friendMap)
    if (friendIds.length === 0) {
      setChats([])
      setLoading(false)
      return
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', friendIds)

    const profileMap: { [id: string]: Profile } = {}
    profiles?.forEach(p => {
      profileMap[p.id] = p as Profile
    })

    const chatItems: ChatItem[] = friendIds.map(fId => ({
      friend: profileMap[fId] || { id: fId, username: 'Kullanıcı', avatar_url: null, push_token: null, created_at: '' },
      lastMessage: friendMap[fId],
    }))

    setChats(chatItems)
    setLoading(false)
  }

  function handleDeleteChat(friendId: string, friendName: string) {
    Alert.alert(
      'Sohbeti Sil',
      `${friendName} ile olan tüm sohbet geçmişiniz kalıcı olarak silinecek. Emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const userId = session?.user.id
            if (!userId || !friendId) return
            const { error } = await supabase
              .from('messages')
              .delete()
              .or(`and(sender_id.eq.${userId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${userId})`)

            if (error) {
              Alert.alert('Hata', 'Sohbet silinemedi.')
            } else {
              setChats(prev => prev.filter(c => c.friend.id !== friendId))
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
    headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
    scroll: { padding: 16 },
    
    chatCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      borderWidth: 0.5,
      borderColor: theme.border,
    },
    avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 14 },
    avatarPlaceholder: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    chatInfo: { flex: 1 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    friendName: { fontSize: 15, fontWeight: '700', color: theme.text },
    timeText: { fontSize: 11, color: theme.textSub },
    lastMsgText: { fontSize: 13, color: theme.textSub },
    deleteChatBtn: { padding: 8, marginLeft: 6 },
    emptyText: { color: theme.textSub, fontSize: 14, textAlign: 'center', marginVertical: 60 },
  })

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Mesajlar</Text>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 150 }}
        showsVerticalScrollIndicator={false}
        bounces={true}
        alwaysBounceVertical={true}
        refreshControl={
          <RefreshControl
            key={`${theme.bg}-${refreshColor}`}
            refreshing={loading}
            onRefresh={fetchConversations}
            tintColor={refreshColor}
            colors={[refreshColor]}
            progressBackgroundColor={theme.card}
          />
        }
      >
        {chats.length === 0 && !loading ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: 60 }}>
              <Text style={s.emptyText}>Henüz hiç mesajınız yok.{'\n'}Arkadaşlarınızın profilinden sohbet başlatabilirsiniz!</Text>
            </View>
          ) : (
            chats.map(item => {
              const fName = item.friend.full_name || item.friend.username || 'Kullanıcı'
              return (
                <TouchableOpacity
                  key={item.friend.id}
                  style={s.chatCard}
                  onPress={() => router.push({ pathname: '/chat/[friendId]', params: { friendId: item.friend.id } })}
                  onLongPress={() => handleDeleteChat(item.friend.id, fName)}
                  activeOpacity={0.8}
                >
                  {item.friend.avatar_url ? (
                    <Image source={{ uri: item.friend.avatar_url }} style={s.avatar} />
                  ) : (
                    <View style={s.avatarPlaceholder}>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: theme.textSub }}>
                        {(item.friend.username || 'D')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={s.chatInfo}>
                    <View style={s.topRow}>
                      <Text style={s.friendName}>{fName}</Text>
                      <Text style={s.timeText}>{formatTime(item.lastMessage.created_at)}</Text>
                    </View>
                    <Text style={s.lastMsgText} numberOfLines={1}>
                      {item.lastMessage.sender_id === session?.user.id ? 'Sen: ' : ''}
                      {(item.lastMessage.image_url || item.lastMessage.content?.startsWith('[PHOTO]:')) ? 'Fotoğraf' : item.lastMessage.content}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })
          )}
        </ScrollView>
    </SafeAreaView>
  )
}
