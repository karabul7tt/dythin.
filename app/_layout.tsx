import React, { useEffect, useState } from 'react'
import 'react-native-url-polyfill/auto'
import { Stack } from 'expo-router'
import { LogBox, View, ActivityIndicator, StatusBar } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Font from 'expo-font'
import { AppProvider } from '../context/AppContext'

// Alttan çıkan tüm sarı/turuncu geliştirici uyarı bildirimlerini kapat
LogBox.ignoreAllLogs(true)

export { ErrorBoundary } from 'expo-router'

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false)

  useEffect(() => {
    let mounted = true
    async function loadResources() {
      try {
        await Font.loadAsync(Ionicons.font)
      } catch (e) {
        // Font yükleme hatası olursa dahi uygulamanın açılmasını engelleme
      } finally {
        if (mounted) {
          setFontsLoaded(true)
        }
      }
    }
    loadResources()
    return () => {
      mounted = false
    }
  }, [])

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a12', justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a12" />
        <ActivityIndicator size="small" color="#7F77DD" />
      </View>
    )
  }

  return (
    <SafeAreaProvider>
      <AppProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="messages" />
          <Stack.Screen name="chat/[friendId]" />
          <Stack.Screen name="user-profile" />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  )
}


