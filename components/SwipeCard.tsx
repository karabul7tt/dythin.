import React, { useRef, useState } from 'react'
import * as Haptics from 'expo-haptics'
import { View, Text, Image, StyleSheet, Dimensions, PanResponder, Animated, Modal, TouchableOpacity } from 'react-native'
import { useApp } from '../context/AppContext'
import type { Post } from '../lib/types'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3

type Props = {
  post: Post
  onSwipeLeft: () => void
  onSwipeRight: () => void
  onSwipeDown?: () => void
}

export default function SwipeCard({ post, onSwipeLeft, onSwipeRight, onSwipeDown }: Props) {
  const { theme } = useApp()
  const [zoomUri, setZoomUri] = useState<string | null>(null)
  const position = useRef(new Animated.ValueXY()).current

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-12deg', '0deg', '12deg'],
    extrapolate: 'clamp',
  })

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })

  const nopeOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  })

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gesture) => {
      position.setValue({ x: gesture.dx, y: gesture.dy })
    },
    onPanResponderRelease: (evt, gesture) => {
      // Tap Detection (moved less than 8px)
      if (Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8) {
        const touchX = gesture.x0 || evt.nativeEvent.pageX || 0
        if (post.image_b_url) {
          if (touchX < SCREEN_WIDTH / 2) {
            setZoomUri(post.image_a_url || (post as any).image_url)
          } else {
            setZoomUri(post.image_b_url)
          }
        } else {
          setZoomUri(post.image_a_url || (post as any).image_url)
        }
        Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start()
        return
      }

      // Vertical Swipe Down (Reels / TikTok next poll skip)
      if (gesture.dy > SWIPE_THRESHOLD && Math.abs(gesture.dy) > Math.abs(gesture.dx)) {
        Animated.spring(position, { toValue: { x: 0, y: SCREEN_WIDTH * 1.5 }, useNativeDriver: false }).start()
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        if (onSwipeDown) setTimeout(onSwipeDown, 200)
        else setTimeout(onSwipeLeft, 200)
      } else if (gesture.dx > SWIPE_THRESHOLD) {
        Animated.spring(position, { toValue: { x: SCREEN_WIDTH * 1.5, y: 0 }, useNativeDriver: false }).start()
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        setTimeout(onSwipeRight, 200)
      } else if (gesture.dx < -SWIPE_THRESHOLD) {
        Animated.spring(position, { toValue: { x: -SCREEN_WIDTH * 1.5, y: 0 }, useNativeDriver: false }).start()
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        setTimeout(onSwipeLeft, 200)
      } else {
        Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start()
      }
    },
  })).current

  const s = StyleSheet.create({
    card: {
      width: SCREEN_WIDTH - 20,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      position: 'absolute',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 6,
    },
    imageContainer: {
      flexDirection: 'row',
      width: '100%',
      height: 470,
      position: 'relative',
    },
    imageHalfContainer: {
      width: '50%',
      height: '100%',
      position: 'relative',
    },
    imageHalf: {
      width: '100%',
      height: '100%',
    },
    imageFull: {
      width: '100%',
      height: '100%',
    },
    info: { padding: 14 },
    title: { fontSize: 16, fontWeight: '700', color: theme.text },
    desc: { fontSize: 13, color: theme.textSub, marginTop: 4 },
    badge: {
      position: 'absolute',
      top: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 14,
      borderWidth: 1.5,
      backgroundColor: 'rgba(14, 14, 26, 0.92)',
    },
    rightBadge: { left: 20, borderColor: '#7F77DD' },
    leftBadge: { right: 20, borderColor: '#C9A84C' },
    singleLikeBadge: { left: 20, borderColor: '#4EBA6F' },
    singleNopeBadge: { right: 20, borderColor: '#E55353' },
    badgeText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
    rightText: { color: '#7F77DD' },
    leftText: { color: '#C9A84C' },
    singleLikeText: { color: '#4EBA6F' },
    singleNopeText: { color: '#E55353' },
  })

  return (
    <Animated.View
      style={[s.card, { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] }]}
      {...panResponder.panHandlers}
    >
      {post.image_b_url ? (
        <View style={{ flexDirection: 'row', width: '100%', height: 470, padding: 10, gap: 10 }}>
          {/* Left Photo A */}
          <View style={{ flex: 1, height: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#0a0a12', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
            <Image source={{ uri: post.image_a_url || (post as any).image_url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            <View style={{ position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 }}>
              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>Sol</Text>
            </View>
          </View>

          {/* Right Photo B */}
          <View style={{ flex: 1, height: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#0a0a12', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
            <Image source={{ uri: post.image_b_url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            <View style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 }}>
              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>Sağ</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ width: '100%', height: 470, backgroundColor: '#0a0a12', position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
          <Image source={{ uri: post.image_a_url || (post as any).image_url }} style={s.imageFull} resizeMode="contain" />
        </View>
      )}

      {post.image_b_url ? (
        <>
          <Animated.View style={[s.badge, s.rightBadge, { opacity: likeOpacity }]}>
            <Text style={[s.badgeText, s.rightText]}>Sağdaki Seçildi</Text>
          </Animated.View>
          <Animated.View style={[s.badge, s.leftBadge, { opacity: nopeOpacity }]}>
            <Text style={[s.badgeText, s.leftText]}>Soldaki Seçildi</Text>
          </Animated.View>
        </>
      ) : (
        <>
          <Animated.View style={[s.badge, s.singleLikeBadge, { opacity: likeOpacity }]}>
            <Text style={[s.badgeText, s.singleLikeText]}>Beğendim</Text>
          </Animated.View>
          <Animated.View style={[s.badge, s.singleNopeBadge, { opacity: nopeOpacity }]}>
            <Text style={[s.badgeText, s.singleNopeText]}>Geçtim</Text>
          </Animated.View>
        </>
      )}

      <View style={s.info}>
        <Text style={s.title}>{post.title}</Text>
        {post.description ? <Text style={s.desc}>{post.description}</Text> : null}
      </View>

      {/* Full-Screen Zoom Lightbox Modal */}
      <Modal visible={!!zoomUri} transparent animationType="fade" onRequestClose={() => setZoomUri(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', padding: 10 }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.2)', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setZoomUri(null)}
          >
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>✕</Text>
          </TouchableOpacity>
          {zoomUri && (
            <Image source={{ uri: zoomUri }} style={{ width: '100%', height: '85%' }} resizeMode="contain" />
          )}
          <TouchableOpacity
            style={{ marginTop: 16, backgroundColor: theme.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 }}
            onPress={() => setZoomUri(null)}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Kapat</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </Animated.View>
  )
}
