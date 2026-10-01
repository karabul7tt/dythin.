import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { themes, ThemeName, Theme } from '../lib/theme'
import { Session } from '@supabase/supabase-js'
import * as Linking from 'expo-linking'
import { registerForPushNotificationsAsync } from '../lib/notifications'
import { authenticateFromUrl, extractUserProfile, syncUserProfileWithDatabase } from '../lib/authHelper'

import { Language, translate } from '../lib/i18n'

type AppContextType = {
  session: Session | null
  isAuthLoading: boolean
  theme: Theme
  themeName: ThemeName
  setThemeName: (name: ThemeName) => void
  language: Language
  setLanguage: (lang: Language) => Promise<void>
  t: (path: string, params?: Record<string, string | number>) => string
  refreshSession: () => Promise<Session | null>
  signOut: () => Promise<void>
}

const AppContext = createContext<AppContextType>({
  session: null,
  isAuthLoading: true,
  theme: themes.purple,
  themeName: 'purple',
  setThemeName: () => {},
  language: 'tr',
  setLanguage: async () => {},
  t: (path) => path,
  refreshSession: async () => null,
  signOut: async () => {},
})

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [themeName, setThemeNameState] = useState<ThemeName>('purple')
  const [language, setLanguageState] = useState<Language>('tr')

  async function setLanguage(lang: Language) {
    setLanguageState(lang)
    try {
      await AsyncStorage.setItem('app_language', lang)
      if (session?.user) {
        supabase.auth.updateUser({ data: { preferred_language: lang } }).catch(() => null)
      }
    } catch {}
  }

  const t = (path: string, params?: Record<string, string | number>) => {
    return translate(language, path, params)
  }

  async function signOut(): Promise<void> {
    try {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => null)
    } finally {
      setSession(null)
    }
  }

  async function refreshSession(): Promise<Session | null> {
    try {
      const { data: refreshed, error } = await supabase.auth.refreshSession()
      if (!error && refreshed?.session) {
        setSession(refreshed.session)
        return refreshed.session
      }
      const { data: current } = await supabase.auth.getSession()
      if (current?.session) {
        setSession(current.session)
        return current.session
      }
    } catch {}
    return null
  }

  useEffect(() => {
    AsyncStorage.getItem('app_language').then((saved) => {
      if (saved && (saved === 'tr' || saved === 'en' || saved === 'de')) {
        setLanguageState(saved as Language)
      }
    }).catch(() => null)

    AsyncStorage.getItem('themeName').then((saved) => {
      if (saved && saved in themes) setThemeNameState(saved as ThemeName)
    }).catch(() => null)

    supabase.auth.getSession().then((res) => {
      const currentSession = res?.data?.session
      if (res?.error) {
        supabase.auth.signOut({ scope: 'local' }).catch(() => null)
        setSession(null)
      } else {
        setSession(currentSession || null)
        if (currentSession?.user) {
          syncUserProfileWithDatabase(currentSession.user).catch(() => null)

          setTimeout(() => {
            registerForPushNotificationsAsync(currentSession.user.id).catch(() => null)
          }, 3000)
        }
      }
      setIsAuthLoading(false)
    }).catch(() => {
      supabase.auth.signOut({ scope: 'local' }).catch(() => null)
      setSession(null)
      setIsAuthLoading(false)
    })

    const handleOAuthUrl = async (url: string) => {
      if (!url) return
      try {
        const success = await authenticateFromUrl(url)
        if (success) {
          const { data } = await supabase.auth.getSession()
          if (data?.session) {
            setSession(data.session)
            return
          }
        }

        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 500))
          const { data } = await supabase.auth.getSession()
          if (data?.session) {
            setSession(data.session)
            return
          }
        }
      } catch (err) {
        console.warn('OAuth URL parse hatası:', err)
      }
    }

    const linkingSub = Linking.addEventListener('url', (event) => {
      if (event?.url) handleOAuthUrl(event.url)
    })

    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) handleOAuthUrl(initialUrl)
    }).catch(() => null)

    const authListener = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession || null)
      if (newSession?.user) {
        syncUserProfileWithDatabase(newSession.user).catch(() => null)

        setTimeout(() => {
          registerForPushNotificationsAsync(newSession.user.id).catch(() => null)
        }, 3000)
      }
      setIsAuthLoading(false)
    })

    const safetyTimer = setTimeout(() => {
      setIsAuthLoading(false)
    }, 1000)

    return () => {
      clearTimeout(safetyTimer)
      try {
        linkingSub?.remove()
        authListener?.data?.subscription?.unsubscribe()
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
      language,
      setLanguage,
      t,
      refreshSession,
      signOut,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
