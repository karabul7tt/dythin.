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
      if (saved && saved in themes) setThemeNameState(saved as ThemeName)
    }).catch(() => null)

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        supabase.auth.signOut().catch(() => null)
        setSession(null)
      } else {
        setSession(session)
        if (session?.user) {
          setTimeout(() => {
            registerForPushNotificationsAsync(session.user.id).catch(() => null)
          }, 3000)
        }
      }
      setIsAuthLoading(false)
    }).catch(() => {
      supabase.auth.signOut().catch(() => null)
      setSession(null)
      setIsAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        setTimeout(() => {
          registerForPushNotificationsAsync(session.user.id).catch(() => null)
        }, 3000)
      }
      setIsAuthLoading(false)
    })

    return () => {
      try {
        subscription?.unsubscribe()
      } catch {}
    }
  }, [])

  async function setThemeName(name: ThemeName) {
    setThemeNameState(name)
    try {
      await AsyncStorage.setItem('themeName', name)
    } catch {}
  }

  const activeTheme = themes[themeName] || themes.purple

  return (
    <AppContext.Provider value={{
      session,
      isAuthLoading,
      theme: activeTheme,
      themeName,
      setThemeName,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
