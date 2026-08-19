import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { themes, ThemeName, Theme } from '../lib/theme'
import { Session } from '@supabase/supabase-js'
import { registerForPushNotificationsAsync } from '../lib/notifications'

type AppContextType = {
  session: Session | null
  isAuthLoading: boolean
  theme: Theme
  themeName: ThemeName
  setThemeName: (name: ThemeName) => void
}

const AppContext = createContext<AppContextType>({
  session: null,
  isAuthLoading: true,
  theme: themes.purple,
  themeName: 'purple',
  setThemeName: () => {},
})

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [themeName, setThemeNameState] = useState<ThemeName>('purple')

  useEffect(() => {
    AsyncStorage.getItem('themeName').then((saved) => {
      if (saved) setThemeNameState(saved as ThemeName)
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) registerForPushNotificationsAsync(session.user.id)
      setIsAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) registerForPushNotificationsAsync(session.user.id)
      setIsAuthLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function setThemeName(name: ThemeName) {
    setThemeNameState(name)
    await AsyncStorage.setItem('themeName', name)
  }

  return (
    <AppContext.Provider value={{
      session,
      isAuthLoading,
      theme: themes[themeName],
      themeName,
      setThemeName,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
