import 'react-native-url-polyfill/auto'
import { Slot, usePathname, useRouter, useSegments } from 'expo-router'
import { ActivityIndicator, View, LogBox, StatusBar } from 'react-native'
import { useEffect, useRef } from 'react'
import { AppProvider, useApp } from '../context/AppContext'

// Alttan çıkan tüm sarı/turuncu geliştirici uyarı bildirimlerini kapat
LogBox.ignoreAllLogs(true)

function isRouteInAuth(segments: string[], pathname: string | null): boolean {
  const segs = Array.isArray(segments) ? segments : []
  const path = typeof pathname === 'string' ? pathname : ''

  if (segs.some(s => s === '(auth)' || s === 'login' || s === 'reset-password')) return true
  if (path.includes('login') || path.includes('reset-password') || path.includes('(auth)')) return true

  return false
}

function isRouteInResetPassword(segments: string[], pathname: string | null): boolean {
  const segs = Array.isArray(segments) ? segments : []
  const path = typeof pathname === 'string' ? pathname : ''

  if (segs.some(s => s === 'reset-password')) return true
  if (path.includes('reset-password')) return true

  return false
}

function AuthGate() {
  const { session, isAuthLoading } = useApp()
  const router = useRouter()
  const segments = useSegments()
  const pathname = usePathname()
  const lastNavigatedRef = useRef<string | null>(null)

  useEffect(() => {
    if (isAuthLoading) return

    const inAuth = isRouteInAuth(segments, pathname)
    const inReset = isRouteInResetPassword(segments, pathname)

    if (!session && !inAuth) {
      if (lastNavigatedRef.current !== '/(auth)/login') {
        lastNavigatedRef.current = '/(auth)/login'
        router.replace('/(auth)/login')
      }
    } else if (session && inAuth && !inReset) {
      if (lastNavigatedRef.current !== '/(tabs)') {
        lastNavigatedRef.current = '/(tabs)'
        router.replace('/(tabs)')
      }
    }
  }, [isAuthLoading, pathname, router, segments, session])

  if (isAuthLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a12' }}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a12" />
        <ActivityIndicator size="small" color="#7F77DD" />
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
