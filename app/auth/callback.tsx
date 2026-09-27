import { useEffect, useRef } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import { supabase } from '../../lib/supabase'
import { authenticateFromUrl } from '../../lib/authHelper'

export default function AuthCallback() {
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>()
  const hasHandled = useRef(false)

  useEffect(() => {
    let timer: any = null

    async function processAuth(urlToTry?: string | null) {
      if (hasHandled.current) return
      try {
        // 1. Try URL if provided
        if (urlToTry) {
          const success = await authenticateFromUrl(urlToTry)
          if (success) {
            hasHandled.current = true
            router.replace('/(tabs)')
            return
          }
        }

        // 2. Try params.code if present
        if (params.code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(params.code)
          if (!error && data?.session) {
            hasHandled.current = true
            router.replace('/(tabs)')
            return
          }
        }

        // 3. Check current session
        const { data: cur } = await supabase.auth.getSession()
        if (cur?.session) {
          hasHandled.current = true
          router.replace('/(tabs)')
          return
        }
      } catch (err) {
        console.warn('Callback error:', err)
      }
    }

    // A. Check deep link URL immediately
    Linking.getInitialURL().then((initialUrl) => {
      processAuth(initialUrl)
    }).catch(() => null)

    // B. Also listen for incoming url event
    const sub = Linking.addEventListener('url', ({ url }) => {
      processAuth(url)
    })

    // C. Try params.code
    processAuth()

    // D. Safety fallback: only if nothing succeeded after 4 seconds, return to login
    timer = setTimeout(async () => {
      if (hasHandled.current) return
      const { data } = await supabase.auth.getSession()
      if (data?.session) {
        router.replace('/(tabs)')
      } else {
        router.replace('/(auth)/login')
      }
    }, 4000)

    return () => {
      clearTimeout(timer)
      sub.remove()
    }
  }, [params.code])

  return (
    <View style={{ flex: 1, backgroundColor: '#0e0e1a', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#7F77DD" />
    </View>
  )
}
