import React, { useRef } from 'react'
import * as Haptics from 'expo-haptics'
import { View, Text, Image, StyleSheet, Dimensions, PanResponder, Animated } from 'react-native'
import { useApp } from '../context/AppContext'
import type { Post } from '../lib/types'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3

type Props = {
  post: Post
  onSwipeLeft: () => void
  onSwipeRight: () => void
}

export default function SwipeCard({ post, onSwipeLeft, onSwipeRight }: Props) {
  const { theme } = useApp()
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
      position.setValue({ x: gesture.dx, y: gesture.dy / 4 })
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx > SWIPE_THRESHOLD) {
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
      height: 470,
    },
    info: { padding: 14 },
    title: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 2 },
    desc: { fontSize: 12, color: theme.textSub, lineHeight: 16 },
    badge: {
      position: 'absolute',
      top: 24,
      paddingHorizontal: 18,
      paddingVertical: 10,
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
        <View style={s.imageContainer}>
          <View style={[s.imageHalfContainer, { backgroundColor: '#0a0a12', overflow: 'hidden' }]}>
            <Image source={{ uri: post.image_a_url || (post as any).image_url }} style={s.imageHalf} resizeMode="cover" />
            <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(201, 168, 76, 0.85)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>SOLDAN</Text>
            </View>
          </View>

          <View style={[s.imageHalfContainer, { borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.4)', backgroundColor: '#0a0a12', overflow: 'hidden' }]}>
            <Image source={{ uri: post.image_b_url }} style={s.imageHalf} resizeMode="cover" />
            <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(127, 119, 221, 0.85)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>SAĞDAN</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ width: '100%', height: 470, backgroundColor: '#0a0a12' }}>
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
    </Animated.View>
  )
}
