import React, { useRef, useState } from 'react'
import {
  ScrollView,
  View,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ScrollViewProps,
  Platform,
} from 'react-native'
import { useApp } from '../context/AppContext'
import * as Haptics from 'expo-haptics'

interface CustomRefreshContainerProps extends ScrollViewProps {
  refreshing: boolean
  onRefresh: () => void | Promise<void>
  children: React.ReactNode
}

export default function CustomRefreshContainer({
  refreshing,
  onRefresh,
  children,
  style,
  contentContainerStyle,
  ...rest
}: CustomRefreshContainerProps) {
  const { theme } = useApp()
  const isDark = theme.bg === '#0e0e1a' || theme.bg === '#111108'
  const spinnerColor = isDark ? '#ffffff' : '#555555'

  const [isPulling, setIsPulling] = useState(false)
  const isRefreshingRef = useRef(refreshing)
  isRefreshingRef.current = refreshing

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y
    if (offsetY < -15 && !isPulling && !isRefreshingRef.current) {
      setIsPulling(true)
    } else if (offsetY >= 0 && isPulling && !isRefreshingRef.current) {
      setIsPulling(false)
    }
  }

  const handleScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y
    if (offsetY < -40 && !isRefreshingRef.current) {
      if (Platform.OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }
      onRefresh()
    }
    setIsPulling(false)
  }

  const showSpinner = refreshing || isPulling

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: theme.bg }, style]}
      contentContainerStyle={[
        { flexGrow: 1 },
        contentContainerStyle,
      ]}
      showsVerticalScrollIndicator={false}
      bounces={true}
      alwaysBounceVertical={true}
      scrollEventThrottle={16}
      onScroll={handleScroll}
      onScrollEndDrag={handleScrollEndDrag}
      {...rest}
    >
      {/* Top Animated Theme Spinner Area */}
      {showSpinner && (
        <View
          style={{
            height: 44,
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
          }}
        >
          <ActivityIndicator size="small" color={spinnerColor} />
        </View>
      )}

      {children}
    </ScrollView>
  )
}
