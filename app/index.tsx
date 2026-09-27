import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useApp } from '../context/AppContext'
import { View, ActivityIndicator, StatusBar } from 'react-native'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Index() {
  const { session, isAuthLoading } = useApp()
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string }>()
  const [exchanging, setExchanging] = useState(false)

  useEffect(() => {
    if (params.code) {
      setExchanging(true)
      supabase.auth.exchangeCodeForSession(params.code).then(({ data, error }) => {
        if (!error && data?.session) {
          router.replace('/(tabs)')
        } else {
          router.replace('/(auth)/login')
        }
      }).catch(() => {
        router.replace('/(auth)/login')
      }).finally(() => {
        setExchanging(false)
      })
    }
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


