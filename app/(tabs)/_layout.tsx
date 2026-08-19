import { Tabs } from 'expo-router'
import { useApp } from '../../context/AppContext'
import { View, Text } from 'react-native'

function TabIcon({ focused, label, accent }: { focused: boolean; label: string; accent: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 12, color: focused ? accent : '#555' }}>{label}</Text>
    </View>
  )
}

export default function TabLayout() {
  const { theme } = useApp()
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: theme.tabBar, borderTopColor: theme.border, height: 60 },
      tabBarActiveTintColor: theme.accent,
      tabBarInactiveTintColor: '#555',
    }}>
      <Tabs.Screen name="index" options={{ title: 'Oyla', tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="◎" accent={theme.accent} /> }} />
<Tabs.Screen name="create" options={{ title: 'Paylaş', tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="+" accent={theme.accent} /> }} />
      <Tabs.Screen name="results" options={{ title: 'Sonuçlar', tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="☆" accent={theme.accent} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="👤" accent={theme.accent} /> }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  )
}
