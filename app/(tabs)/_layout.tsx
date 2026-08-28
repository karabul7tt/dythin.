import React, { useEffect } from 'react'
import { Tabs, useRouter } from 'expo-router'
import { useApp } from '../../context/AppContext'
import { Ionicons } from '@expo/vector-icons'
import { Platform } from 'react-native'

export default function TabLayout() {
  const { theme, session, isAuthLoading } = useApp()
  const router = useRouter()

  useEffect(() => {
    if (!isAuthLoading && !session) {
      router.replace('/(auth)/login')
    }
  }, [isAuthLoading, session])


  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme?.tabBar || '#0e0e1a',
          borderTopColor: theme?.border || '#1e1e2e',
          height: Platform.OS === 'ios' ? 80 : 54,
          paddingBottom: Platform.OS === 'ios' ? 24 : 6,
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme?.accent || '#7F77DD',
        tabBarInactiveTintColor: '#666',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Oyla',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'sparkles' : 'sparkles-outline'}
              size={20}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Paylaş',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'add-circle' : 'add-circle-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Sonuçlar',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'stats-chart' : 'stats-chart-outline'}
              size={19}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={20}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  )
}
