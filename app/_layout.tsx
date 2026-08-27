import 'react-native-url-polyfill/auto'
import { Slot, usePathname, useRouter, useSegments } from 'expo-router'
import { ActivityIndicator, View, LogBox, StatusBar } from 'react-native'
import { useEffect, useState } from 'react'
import { AppProvider, useApp } from '../context/AppContext'

// Alttan çıkan tüm sarı/turuncu geliştirici uyarı bildirimlerini kapat
LogBox.ignoreAllLogs(true)

function AuthGate() {
  const { session, isAuthLoading } = useApp()
  const router = useRouter()
  const segments = useSegments()
  const pathname = usePathname()
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    setIsReady(true)
  }, [])

  useEffect(() => {
    if (!isReady || isAuthLoading) return

    try {
      const segs = Array.isArray(segments) ? segments : []
      const currentPath = typeof pathname === 'string' ? pathname : ''

      const isAuthRoute = segs[0] === '(auth)'
      const isPasswordResetRoute = currentPath.includes('reset-password') || segs.includes('reset-password')

      if (!session && !isAuthRoute) {
        router.replace('/(auth)/login')
      } else if (session && isAuthRoute && !isPasswordResetRoute) {
        router.replace('/(tabs)')
      }
    } catch (e) {
      console.warn('Navigation guard error:', e)
    }
  }, [isReady, isAuthLoading, pathname, segments, session, router])

  if (isAuthLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a12' }}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a12" />
        <ActivityIndicator size="large" color="#7F77DD" />
      </View>
    )
  }

  return <Slot />
}

export { ErrorBoundary } from 'expo-router'

export default function RootLayout() {
  return (
    <AppProvider>
      <AuthGate />
    </AppProvider>
  )
}

