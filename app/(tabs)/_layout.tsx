import React, { useEffect } from 'react'
import { Tabs, useRouter } from 'expo-router'
import { useApp } from '../../context/AppContext'
import { Ionicons } from '@expo/vector-icons'
import { Platform, Alert } from 'react-native'
import { useFonts } from 'expo-font'
import { checkIsUserBanned } from '../../lib/admin'

export default function TabLayout() {
  const { theme, session, isAuthLoading, signOut, t } = useApp()
  const router = useRouter()

  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  })

  useEffect(() => {
    if (!isAuthLoading) {
      if (!session) {
        router.replace('/(auth)/login')
      } else if (session?.user) {
        checkIsUserBanned(session.user.id, session.user.user_metadata?.username, session.user.email).then((isBanned) => {
          if (isBanned) {
            signOut()
            Alert.alert(
              'Hesabınız Askıya Alındı',
              'Hesabınız yönetici tarafından askıya alınmıştır. Yönetici banınızı kaldırana kadar uygulamaya erişemezsiniz.'
            )
            router.replace('/(auth)/login')
          }
        })
      }
    }
  }, [isAuthLoading, session])

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme?.tabBar || '#0e0e1a',
          borderTopColor: theme?.border || '#1e1e2e',
          height: Platform.OS === 'ios' ? 84 : 62,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme?.accent || '#7F77DD',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.vote'),
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'sparkles' : 'sparkles-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: t('tabs.create'),
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'add-circle' : 'add-circle-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: t('tabs.results'),
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'stats-chart' : 'stats-chart-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  )
}

