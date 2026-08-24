import React, { useRef } from 'react'
import {
  View,
  Text,
  Image,
  Dimensions,
  PanResponder,
  Animated,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const { width: WIN_W, height: WIN_H } = Dimensions.get('window')

interface ZoomablePhotoProps {
  uri: string
  accentColor: string
  onClose: () => void
}

export default function ZoomablePhoto({ uri, accentColor, onClose }: ZoomablePhotoProps) {
  const scale = useRef(new Animated.Value(1)).current
  const translateX = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(0)).current

  const lastScale = useRef(1)
  const lastTX = useRef(0)
  const lastTY = useRef(0)
  const initialDist = useRef(0)
  const initialMidX = useRef(0)
  const initialMidY = useRef(0)
  const lastTapRef = useRef<number>(0)

  const getDistance = (touches: any[]) => {
    const dx = touches[0].pageX - touches[1].pageX
    const dy = touches[0].pageY - touches[1].pageY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const getMid = (touches: any[]) => ({
    x: (touches[0].pageX + touches[1].pageX) / 2,
    y: (touches[0].pageY + touches[1].pageY) / 2,
  })

  const handleDoubleTap = (evt: any) => {
    const now = Date.now()
    const DOUBLE_TAP_DELAY = 300
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      if (lastScale.current > 1.2) {
        Animated.parallel([
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
        ]).start()
        lastScale.current = 1
        lastTX.current = 0
        lastTY.current = 0
      } else {
        const touchX = evt.nativeEvent.pageX - WIN_W / 2
        const touchY = evt.nativeEvent.pageY - WIN_H / 2
        const targetScale = 2.5
        const targetTX = -touchX * 0.7
        const targetTY = -touchY * 0.7

        Animated.parallel([
          Animated.spring(scale, { toValue: targetScale, useNativeDriver: true }),
          Animated.spring(translateX, { toValue: targetTX, useNativeDriver: true }),
          Animated.spring(translateY, { toValue: targetTY, useNativeDriver: true }),
        ]).start()
        lastScale.current = targetScale
        lastTX.current = targetTX
        lastTY.current = targetTY
      }
    }
    lastTapRef.current = now
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length >= 2,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: (evt) => {
        const touches = Array.from(evt.nativeEvent.touches)
        if (touches.length >= 2) {
          initialDist.current = getDistance(touches)
          const mid = getMid(touches)
          initialMidX.current = mid.x
          initialMidY.current = mid.y
        }
      },

      onPanResponderMove: (evt) => {
        const touches = Array.from(evt.nativeEvent.touches)
        if (touches.length >= 2 && initialDist.current > 0) {
          const dist = getDistance(touches)
          const newScale = Math.max(1, Math.min(4.5, lastScale.current * (dist / initialDist.current)))
          const mid = getMid(touches)
          const cx = WIN_W / 2
          const cy = WIN_H / 2
          const focalX = initialMidX.current - cx
          const focalY = initialMidY.current - cy
          const scaleDelta = newScale / lastScale.current
          const tx = lastTX.current * scaleDelta + focalX * (1 - scaleDelta) + (mid.x - initialMidX.current)
          const ty = lastTY.current * scaleDelta + focalY * (1 - scaleDelta) + (mid.y - initialMidY.current)

          scale.setValue(newScale)
          translateX.setValue(tx)
          translateY.setValue(ty)
        }
      },

      onPanResponderRelease: () => {
        lastScale.current = (scale as any)._value ?? 1
        lastTX.current = (translateX as any)._value ?? 0
        lastTY.current = (translateY as any)._value ?? 0
        initialDist.current = 0

        if (lastScale.current <= 1.05) {
          Animated.parallel([
            Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
          ]).start()
          lastScale.current = 1
          lastTX.current = 0
          lastTY.current = 0
        }
      },
    })
  ).current

  return (
    <View
      style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}
      collapsable={false}
      {...panResponder.panHandlers}
    >
      <TouchableWithoutFeedback onPress={handleDoubleTap}>
        <Animated.View
          style={{
            transform: [{ translateX }, { translateY }, { scale }],
            width: WIN_W,
            height: WIN_H * 0.84,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          collapsable={false}
        >
          <Image
            source={{ uri }}
            style={{ width: WIN_W, height: WIN_H * 0.84 }}
            resizeMode="contain"
          />
        </Animated.View>
      </TouchableWithoutFeedback>

      {/* Top Minimal Close Button */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: Platform.OS === 'ios' ? 50 : 30,
          right: 20,
          backgroundColor: 'rgba(255,255,255,0.18)',
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99,
        }}
        onPress={onClose}
        activeOpacity={0.8}
      >
        <Ionicons name="close" size={22} color="#ffffff" />
      </TouchableOpacity>

      {/* Bottom Minimal Close Pill */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 45 : 30,
          backgroundColor: accentColor,
          paddingHorizontal: 32,
          paddingVertical: 12,
          borderRadius: 24,
          shadowColor: accentColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
          elevation: 6,
          zIndex: 99,
        }}
        onPress={onClose}
        activeOpacity={0.8}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Kapat</Text>
      </TouchableOpacity>
    </View>
  )
}
