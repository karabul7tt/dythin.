import { useEffect, useRef } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import { supabase } from '../../lib/supabase'
import { authenticateFromUrl } from '../../lib/authHelper'
import { checkIsUserBanned } from '../../lib/admin'

export default function AuthCallback() {
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>()
  const hasHandled = useRef(false)

  useEffect(() => {
    let timer: any = null

    async function processAuth(urlToTry?: string | null) {
      if (hasHandled.current) return
      try {
        if (urlToTry) {
          const success = await authenticateFromUrl(urlToTry)
          if (success) {
            const { data } = await supabase.auth.getSession()
            if (data?.session?.user) {
              const isBanned = await checkIsUserBanned(data.session.user.id, data.session.user.user_metadata?.username, data.session.user.email)
              if (isBanned) {
                await supabase.auth.signOut({ scope: 'local' }).catch(() => null)
                hasHandled.current = true
                router.replace('/(auth)/login')
                return
              }
            }
            hasHandled.current = true
            router.replace('/(tabs)')
            return
          }
        }

        if (params.code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(params.code)
          if (!error && data?.session?.user) {
            const isBanned = await checkIsUserBanned(data.session.user.id, data.session.user.user_metadata?.username, data.session.user.email)
            if (isBanned) {
              await supabase.auth.signOut({ scope: 'local' }).catch(() => null)
              hasHandled.current = true
              router.replace('/(auth)/login')
              return
            }
            hasHandled.current = true
            router.replace('/(tabs)')
            return
          }
        }

        const { data: cur } = await supabase.auth.getSession()
        if (cur?.session?.user) {
          const isBanned = await checkIsUserBanned(cur.session.user.id, cur.session.user.user_metadata?.username, cur.session.user.email)
          if (isBanned) {
            await supabase.auth.signOut({ scope: 'local' }).catch(() => null)
            hasHandled.current = true
            router.replace('/(auth)/login')
            return
          }
          hasHandled.current = true
          router.replace('/(tabs)')
          return
        }
      } catch (err) {
        console.warn('Callback error:', err)
      }
    }

    Linking.getInitialURL().then((initialUrl) => {
      processAuth(initialUrl)
    }).catch(() => null)

    const sub = Linking.addEventListener('url', ({ url }) => {
      processAuth(url)
    })

    processAuth()

    timer = setTimeout(async () => {
      if (hasHandled.current) return
      const { data } = await supabase.auth.getSession()
      if (data?.session?.user) {
        const isBanned = await checkIsUserBanned(data.session.user.id, data.session.user.user_metadata?.username, data.session.user.email)
        if (isBanned) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => null)
          router.replace('/(auth)/login')
          return
        }
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
