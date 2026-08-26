import { Slot, usePathname, useRouter, useSegments } from 'expo-router'
import { ActivityIndicator, View, LogBox } from 'react-native'
import { useEffect } from 'react'
import { AppProvider, useApp } from '../context/AppContext'

// Alttan çıkan tüm sarı/turuncu geliştirici uyarı bildirimlerini kapat
LogBox.ignoreAllLogs(true)

function AuthGate() {
  const { session, isAuthLoading } = useApp()
  const router = useRouter()
  const segments = useSegments()
  const pathname = usePathname()

  useEffect(() => {
    if (isAuthLoading) return

    const isAuthRoute = segments[0] === '(auth)'
    const isPasswordResetRoute = pathname === '/reset-password'
    if (!session && !isAuthRoute) router.replace('/(auth)/login')
    if (session && isAuthRoute && !isPasswordResetRoute) router.replace('/(tabs)')
  }, [isAuthLoading, pathname, router, segments, session])

  if (isAuthLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0e0e1a' }}>
        <ActivityIndicator color="#7F77DD" />
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

