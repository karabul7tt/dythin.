import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { themes, ThemeName, Theme } from '../lib/theme'
import { Session } from '@supabase/supabase-js'
import * as Linking from 'expo-linking'
import { registerForPushNotificationsAsync } from '../lib/notifications'

type AppContextType = {
  session: Session | null
  isAuthLoading: boolean
  theme: Theme
  themeName: ThemeName
  setThemeName: (name: ThemeName) => void
  refreshSession: () => Promise<Session | null>
}

const AppContext = createContext<AppContextType>({
  session: null,
  isAuthLoading: true,
  theme: themes.purple,
  themeName: 'purple',
  setThemeName: () => {},
  refreshSession: async () => null,
})

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [themeName, setThemeNameState] = useState<ThemeName>('purple')

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
    AsyncStorage.getItem('themeName').then((saved) => {
      if (saved && saved in themes) setThemeNameState(saved as ThemeName)
    }).catch(() => null)

    supabase.auth.getSession().then((res) => {
      const currentSession = res?.data?.session
      if (res?.error) {
        supabase.auth.signOut().catch(() => null)
        setSession(null)
      } else {
        setSession(currentSession || null)
        if (currentSession?.user) {
          setTimeout(() => {
            registerForPushNotificationsAsync(currentSession.user.id).catch(() => null)
          }, 3000)
        }
      }
      setIsAuthLoading(false)
    }).catch(() => {
      supabase.auth.signOut().catch(() => null)
      setSession(null)
      setIsAuthLoading(false)
    })

    // OAuth Deep Link Callback Dinleyici (Google & Apple ile Giriş)
    const handleOAuthUrl = async (url: string) => {
      if (!url) return
      try {
        // Oturum zaten varsa gereksiz exchange yapma
        const { data: check } = await supabase.auth.getSession()
        if (check?.session) {
          setSession(check.session)
          return
        }

        if (url.includes('#access_token') || url.includes('&access_token')) {
          const fragment = url.includes('#') ? url.split('#')[1] : url.split('?')[1]
          if (fragment) {
            const params = new URLSearchParams(fragment)
            const access_token = params.get('access_token')
            const refresh_token = params.get('refresh_token')
            if (access_token && refresh_token) {
              const { data } = await supabase.auth.setSession({ access_token, refresh_token })
              if (data?.session) setSession(data.session)
            }
          }
        } else if (url.includes('code=')) {
          const codeMatch = url.match(/[?&]code=([^&#]+)/)
          const code = codeMatch ? decodeURIComponent(codeMatch[1]) : null
          if (code) {
            const { data } = await supabase.auth.exchangeCodeForSession(code).catch(() => ({ data: null }))
            if (data?.session) setSession(data.session)
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
        // Google veya Apple ile ilk kez giriş yapıldıysa profil kaydını otomatik tamamla
        try {
          const u = newSession.user
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', u.id)
            .maybeSingle()

          if (!existingProfile) {
            const rawEmail = u.email || ''
            const name = u.user_metadata?.full_name || u.user_metadata?.name || rawEmail.split('@')[0] || 'Kullanıcı'
            const cleanBase = (u.user_metadata?.preferred_username || rawEmail.split('@')[0] || 'user')
              .toLowerCase()
              .replace(/[^a-z0-9_.]/g, '')
              .slice(0, 16) || 'user'
            const randomSuffix = Math.floor(1000 + Math.random() * 9000)
            const autoUsername = `${cleanBase}_${randomSuffix}`

            await supabase.from('profiles').insert({
              id: u.id,
              username: autoUsername,
              full_name: name,
              avatar_url: u.user_metadata?.avatar_url || null,
            })
          }
        } catch {
          // Sessiz fallback
        }

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
      refreshSession,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
