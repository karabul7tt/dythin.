import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useApp } from '../context/AppContext'
import { View, ActivityIndicator, StatusBar } from 'react-native'
import { useEffect, useState, useRef } from 'react'
import * as Linking from 'expo-linking'
import { supabase } from '../lib/supabase'
import { authenticateFromUrl } from '../lib/authHelper'
import { checkIsUserBanned } from '../lib/admin'

export default function Index() {
  const { session, isAuthLoading } = useApp()
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string }>()
  const [exchanging, setExchanging] = useState(false)
  const isHandled = useRef(false)

  useEffect(() => {
    async function checkIncoming() {
      if (isHandled.current) return

      if (params.code) {
        setExchanging(true)
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(params.code)
          if (!error && data?.session?.user) {
            const isBanned = await checkIsUserBanned(data.session.user.id, data.session.user.user_metadata?.username, data.session.user.email)
            if (isBanned) {
              await supabase.auth.signOut({ scope: 'local' }).catch(() => null)
              isHandled.current = true
              router.replace('/(auth)/login')
              return
            }
            isHandled.current = true
            router.replace('/(tabs)')
            return
          }
        } catch {}
        setExchanging(false)
      }

      try {
        const initialUrl = await Linking.getInitialURL()
        if (initialUrl && (initialUrl.includes('code=') || initialUrl.includes('access_token'))) {
          setExchanging(true)
          const success = await authenticateFromUrl(initialUrl)
          if (success) {
            const { data } = await supabase.auth.getSession()
            if (data?.session?.user) {
              const isBanned = await checkIsUserBanned(data.session.user.id, data.session.user.user_metadata?.username, data.session.user.email)
              if (isBanned) {
                await supabase.auth.signOut({ scope: 'local' }).catch(() => null)
                isHandled.current = true
                router.replace('/(auth)/login')
                return
              }
            }
            isHandled.current = true
            router.replace('/(tabs)')
            return
          }
          setExchanging(false)
        }
      } catch {}
    }

    checkIncoming()
  }, [params.code])

  if (isAuthLoading || exchanging || params.code) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a12', justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a12" />
        <ActivityIndicator size="small" color="#7F77DD" />
      </View>
    )
  }

  if (session) {
    return <Redirect href="/(tabs)" />
  }

  return <Redirect href="/(auth)/login" />
}
