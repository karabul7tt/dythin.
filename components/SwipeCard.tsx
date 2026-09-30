import React, { useRef, useState } from 'react'
import * as Haptics from 'expo-haptics'
import { View, Text, Image, StyleSheet, Dimensions, PanResponder, Animated, Modal, TouchableOpacity, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useApp } from '../context/AppContext'
import type { Post } from '../lib/types'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.22

import ZoomablePhoto from './ZoomablePhoto'

type Props = {
  post: Post
  onSwipeLeft: () => void
  onSwipeRight: () => void
  onSwipeDown?: () => void
}

export default function SwipeCard({ post, onSwipeLeft, onSwipeRight, onSwipeDown }: Props) {
  const { theme } = useApp()
  const router = useRouter()
  const [zoomUri, setZoomUri] = useState('')
  const [zoomMounted, setZoomMounted] = useState(false)

  const authorProfile = post.profiles
  const authorUsername = authorProfile?.username || 'kullanici'
  const authorAvatar = authorProfile?.avatar_url
  const authorInitial = (authorUsername.charAt(0) || 'D').toUpperCase()

  const openZoom = (uri: string) => {
    setZoomMounted(false)
    setZoomUri('')
    setTimeout(() => { setZoomUri(uri); setZoomMounted(true) }, 80)
  }

  const closeZoom = () => { setZoomMounted(false); setZoomUri('') }

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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
      onPanResponderGrant: () => {
        position.stopAnimation()
      },
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy })
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        Animated.spring(position, {
          toValue: { x: 0, y: 0 },
          friction: 6,
          tension: 50,
          useNativeDriver: false,
        }).start()
      },
      onPanResponderRelease: (evt, gesture) => {
        if (Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8) {
          const touchY = evt.nativeEvent.locationY || 0
          if (touchY >= 470 && post.user_id) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            router.push({ pathname: '/user-profile', params: { userId: post.user_id } })
            Animated.spring(position, { toValue: { x: 0, y: 0 }, friction: 6, tension: 50, useNativeDriver: false }).start()
            return
          }

          const touchX = gesture.x0 || evt.nativeEvent.pageX || 0
          if (post.image_b_url) {
            if (touchX < SCREEN_WIDTH / 2) {
              openZoom(post.image_a_url || (post as any).image_url)
            } else {
              openZoom(post.image_b_url)
            }
          } else {
            openZoom(post.image_a_url || (post as any).image_url)
          }
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 6,
            tension: 50,
            useNativeDriver: false,
          }).start()
          return
        }

        const isRight = gesture.dx > SWIPE_THRESHOLD || (gesture.dx > 35 && gesture.vx > 0.35)
        const isLeft = gesture.dx < -SWIPE_THRESHOLD || (gesture.dx < -35 && gesture.vx < -0.35)
        const isDown = gesture.dy > SWIPE_THRESHOLD && Math.abs(gesture.dy) > Math.abs(gesture.dx)

        if (isDown) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          Animated.timing(position, {
            toValue: { x: gesture.dx, y: SCREEN_HEIGHT },
            duration: 220,
            useNativeDriver: false,
          }).start(() => {
            if (onSwipeDown) onSwipeDown()
            else onSwipeLeft()
          })
        } else if (isRight) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          Animated.timing(position, {
            toValue: { x: SCREEN_WIDTH * 1.5, y: gesture.dy },
            duration: 220,
            useNativeDriver: false,
          }).start(() => {
            onSwipeRight()
          })
        } else if (isLeft) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          Animated.timing(position, {
            toValue: { x: -SCREEN_WIDTH * 1.5, y: gesture.dy },
            duration: 220,
            useNativeDriver: false,
          }).start(() => {
            onSwipeLeft()
          })
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 6,
            tension: 50,
            useNativeDriver: false,
          }).start()
        }
      },
    })
  ).current

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
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    avatarWrapper: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1.5,
      borderColor: theme.accent,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
      overflow: 'hidden',
    },
    avatar: {
      width: '100%',
      height: '100%',
      borderRadius: 19,
    },
    avatarFallback: {
      backgroundColor: theme.accent + '25',
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarInitial: {
      color: theme.accent,
      fontWeight: '700',
      fontSize: 15,
    },
    profileTextContainer: {
      flex: 1,
      justifyContent: 'center',
    },
    profileNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    username: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
    fullName: {
      fontSize: 12,
      color: theme.textSub,
      marginLeft: 6,
    },
    profileHint: {
      fontSize: 11,
      color: theme.textSub,
      marginTop: 1,
    },
    viewProfileBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.accent + '15',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 3,
    },
    viewProfileText: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.accent,
    },
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
    rightBadge: { left: 20, borderColor: theme.accent },
    leftBadge: { right: 20, borderColor: theme.accentText },
    singleLikeBadge: { left: 20, borderColor: theme.accent },
    singleNopeBadge: { right: 20, borderColor: theme.textSub },
    badgeText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
    rightText: { color: theme.accent },
    leftText: { color: theme.accentText },
    singleLikeText: { color: theme.accent },
    singleNopeText: { color: theme.textSub },
  })

  return (
    <>
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
          {/* Instagram Reels Tarzı Profil Alanı */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (post.user_id) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                router.push({ pathname: '/user-profile', params: { userId: post.user_id } })
              }
            }}
            style={s.profileRow}
          >
            <View style={s.avatarWrapper}>
              {authorAvatar ? (
                <Image source={{ uri: authorAvatar }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, s.avatarFallback]}>
                  <Text style={s.avatarInitial}>{authorInitial}</Text>
                </View>
              )}
            </View>

            <View style={s.profileTextContainer}>
              <View style={s.profileNameRow}>
                <Text style={s.username} numberOfLines={1}>
                  @{authorUsername}
                </Text>
                {authorProfile?.full_name ? (
                  <Text style={s.fullName} numberOfLines={1}>
                    • {authorProfile.full_name}
                  </Text>
                ) : null}
              </View>
              <Text style={s.profileHint}>Profili incele</Text>
            </View>

            <View style={s.viewProfileBadge}>
              <Text style={s.viewProfileText}>Profil</Text>
              <Ionicons name="chevron-forward" size={12} color={theme.accent} />
            </View>
          </TouchableOpacity>

          <Text style={s.title}>{post.title}</Text>
          {post.description ? <Text style={s.desc}>{post.description}</Text> : null}
        </View>
      </Animated.View>

      {zoomMounted && zoomUri ? (
        <Modal visible={true} transparent animationType="fade" onRequestClose={closeZoom} statusBarTranslucent>
          <ZoomablePhoto uri={zoomUri} accentColor={theme.accent} onClose={closeZoom} />
        </Modal>
      ) : null}
    </>
  )
}
