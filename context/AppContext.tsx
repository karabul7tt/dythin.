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
    // Uygulama ilk açıldığında bildirim iznini güvenli gecikmeyle sor (iOS cold start kilitlenmesini önler)
    const notifTimer = setTimeout(() => {
      registerForPushNotificationsAsync().catch(() => null)
    }, 1500)

    AsyncStorage.getItem('themeName').then((saved) => {
      if (saved) setThemeNameState(saved as ThemeName)
    })

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        supabase.auth.signOut()
        setSession(null)
      } else {
        setSession(session)
        if (session?.user) {
          setTimeout(() => {
            registerForPushNotificationsAsync(session.user.id).catch(() => null)
          }, 2000)
        }
      }
      setIsAuthLoading(false)
    }).catch(() => {
      supabase.auth.signOut()
      setSession(null)
      setIsAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        setTimeout(() => {
          registerForPushNotificationsAsync(session.user.id).catch(() => null)
        }, 1000)
      }
      setIsAuthLoading(false)
    })

    return () => {
      clearTimeout(notifTimer)
      subscription.unsubscribe()
    }
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
