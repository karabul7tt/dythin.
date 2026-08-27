import 'react-native-url-polyfill/auto'
import { Slot } from 'expo-router'
import { LogBox } from 'react-native'
import { AppProvider } from '../context/AppContext'

// Alttan çıkan tüm sarı/turuncu geliştirici uyarı bildirimlerini kapat
LogBox.ignoreAllLogs(true)

export { ErrorBoundary } from 'expo-router'

export default function RootLayout() {
  return (
    <AppProvider>
      <Slot />
    </AppProvider>
  )
}
