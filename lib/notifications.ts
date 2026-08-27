import { Platform } from 'react-native'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { supabase } from './supabase'

let Notifications: any = null

try {
  Notifications = require('expo-notifications')
  if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      })
    } catch {}
  }
} catch (e) {
  // Expo Go Android push notification compatibility guard
}

export async function registerForPushNotificationsAsync(userId?: string): Promise<string | null> {
  if (!Notifications || !Device.isDevice) {
    return null
  }

  // On Android Expo Go, remote push notifications are disabled in SDK 53
  if (Platform.OS === 'android' && Constants.appOwnership === 'expo') {
    return null
  }

  try {
    if (!Notifications.getPermissionsAsync || !Notifications.requestPermissionsAsync || !Notifications.getExpoPushTokenAsync) {
      return null
    }

    let finalStatus = 'denied'
    const permResult = await Notifications.getPermissionsAsync().catch(() => null)
    const existingStatus = permResult?.status || 'denied'
    finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const reqResult = await Notifications.requestPermissionsAsync().catch(() => null)
      finalStatus = reqResult?.status || 'denied'
    }

    if (finalStatus !== 'granted') {
      return null
    }

    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || 'f7bea319-3747-4543-8ef1-503ca5d49a12'
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId }).catch(() => null)
    const pushToken = tokenData?.data

    if (userId && pushToken) {
      try {
        await supabase.from('profiles').update({ push_token: pushToken }).eq('id', userId)
      } catch {}
    }

    if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance?.MAX || 4,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#7F77DD',
      }).catch(() => null)
    }

    return pushToken || null
  } catch (error) {
    return null
  }
}

export async function sendLocalNotification(title: string, body: string) {
  if (!Notifications || !Notifications.scheduleNotificationAsync) return
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger: null,
    })
  } catch {}
}

export async function sendPushNotificationToUser(userId: string, title: string, body: string) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', userId)
      .single()

    if (!profile?.push_token) return

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: profile.push_token,
        sound: 'default',
        title,
        body,
      }),
    })
  } catch {}
}
