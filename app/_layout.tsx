import 'react-native-url-polyfill/auto'
import { Stack } from 'expo-router'
import { LogBox } from 'react-native'
import { AppProvider } from '../context/AppContext'

// Alttan çıkan tüm sarı/turuncu geliştirici uyarı bildirimlerini kapat
LogBox.ignoreAllLogs(true)

export { ErrorBoundary } from 'expo-router'

export default function RootLayout() {
  return (
    <AppProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="messages" />
        <Stack.Screen name="user-profile" />
        <Stack.Screen name="chat/[friendId]" />
      </Stack>
    </AppProvider>
  )
}
