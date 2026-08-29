import 'react-native-url-polyfill/auto'
import { Stack } from 'expo-router'
import { LogBox } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppProvider } from '../context/AppContext'

// Alttan çıkan tüm sarı/turuncu geliştirici uyarı bildirimlerini kapat
LogBox.ignoreAllLogs(true)

export { ErrorBoundary } from 'expo-router'

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AppProvider>
    </SafeAreaProvider>
  )
}



