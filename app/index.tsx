import { Redirect } from 'expo-router'
import { useApp } from '../context/AppContext'
import { View, ActivityIndicator, StatusBar } from 'react-native'

export default function Index() {
  const { session, isAuthLoading } = useApp()

  if (isAuthLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a12', justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a12" />
        <ActivityIndicator size="small" color="#7F77DD" />
      </View>
    )
  }

  if (session) {
    return <Redirect href="/(tabs)" />
  }

  return <Redirect href="/(auth)/login" />
}


