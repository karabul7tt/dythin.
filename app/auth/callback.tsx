import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>()

  useEffect(() => {
    async function handleAuth() {
      try {
        if (params.code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(params.code)
          if (!error && data?.session) {
            router.replace('/(tabs)')
            return
          }
        }
        const { data: current } = await supabase.auth.getSession()
        if (current?.session) {
          router.replace('/(tabs)')
          return
        }
      } catch (err) {
        console.warn('Callback exchange error:', err)
      }
      router.replace('/(auth)/login')
    }

    handleAuth()
  }, [params.code])

  return (
    <View style={{ flex: 1, backgroundColor: '#0e0e1a', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#7F77DD" />
    </View>
  )
}
