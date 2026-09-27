import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useApp } from '../context/AppContext'
import { View, ActivityIndicator, StatusBar } from 'react-native'
import { useEffect, useState, useRef } from 'react'
import * as Linking from 'expo-linking'
import { supabase } from '../lib/supabase'
import { authenticateFromUrl } from '../lib/authHelper'

export default function Index() {
  const { session, isAuthLoading } = useApp()
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string }>()
  const [exchanging, setExchanging] = useState(false)
  const isHandled = useRef(false)

  useEffect(() => {
    async function checkIncoming() {
      if (isHandled.current) return

      // 1. Try params.code
      if (params.code) {
        setExchanging(true)
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(params.code)
          if (!error && data?.session) {
            isHandled.current = true
            router.replace('/(tabs)')
            return
          }
        } catch {}
        setExchanging(false)
      }

      // 2. Try initial deep link URL
      try {
        const initialUrl = await Linking.getInitialURL()
        if (initialUrl && (initialUrl.includes('code=') || initialUrl.includes('access_token'))) {
          setExchanging(true)
          const success = await authenticateFromUrl(initialUrl)
          if (success) {
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
