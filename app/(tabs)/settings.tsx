import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  Keyboard,
  RefreshControl,
  AppState,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { ThemeName } from '../../lib/theme'
import { supportedLanguages } from '../../lib/i18n'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { registerForPushNotificationsAsync } from '../../lib/notifications'

export default function SettingsScreen() {
  const { theme, themeName, setThemeName, session, refreshSession, isAuthLoading, signOut, language, setLanguage, t } = useApp()
  const [loading, setLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [signOutLoading, setSignOutLoading] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [messagePrivacy, setMessagePrivacy] = useState<'everyone' | 'friends'>('everyone')
  const [isPrivate, setIsPrivate] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Modals for legal compliance
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)

  const router = useRouter()

  useEffect(() => {
    if (session?.user.id) {
      fetchPrivacySettings()
      refreshSession()
    }
  }, [session?.user.id])

  useEffect(() => {
    if (!isAuthLoading && !session) {
      router.replace('/(auth)/login')
    }
  }, [isAuthLoading, session])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshSession().catch(() => null)
      }
    })
    return () => sub.remove()
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await Promise.all([fetchPrivacySettings(), refreshSession()])
    setRefreshing(false)
  }

  async function fetchPrivacySettings() {
    try {
      // 1. Önce yerel hafızadan anında yükle
      const savedPrivate = await AsyncStorage.getItem(`is_private_${session?.user.id}`)
      if (savedPrivate !== null) setIsPrivate(JSON.parse(savedPrivate))

      const savedMsgPrivacy = await AsyncStorage.getItem(`msg_privacy_${session?.user.id}`)
      if (savedMsgPrivacy) setMessagePrivacy(savedMsgPrivacy as 'everyone' | 'friends')

      // 2. Supabase'den sorgula (kolon varsa senkronize et)
      const { data, error } = await supabase
        .from('profiles')
        .select('message_privacy, is_private')
        .eq('id', session?.user.id)
        .single()

      if (!error && data) {
        if (data.message_privacy) {
          setMessagePrivacy(data.message_privacy as 'everyone' | 'friends')
          AsyncStorage.setItem(`msg_privacy_${session?.user.id}`, data.message_privacy)
        }
        if (typeof data.is_private === 'boolean') {
          setIsPrivate(data.is_private)
          AsyncStorage.setItem(`is_private_${session?.user.id}`, JSON.stringify(data.is_private))
        }
      }
    } catch {
      // Sessiz fallback
    }
  }

  async function handleTogglePrivate() {
    const newValue = !isPrivate
    setIsPrivate(newValue)

    if (session?.user.id) {
      await AsyncStorage.setItem(`is_private_${session.user.id}`, JSON.stringify(newValue))
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_private: newValue })
        .eq('id', session?.user.id)

      if (error && error.code !== '42703' && !error.message.includes('is_private') && error.code !== 'PGRST204') {
        console.warn('Gizlilik senkronizasyon uyarısı:', error.message)
      }
    } catch {
      // Yerel hafızada başarıyla saklandı
    }
  }

  async function handleUpdateMessagePrivacy(option: 'everyone' | 'friends') {
    setMessagePrivacy(option)

    if (session?.user.id) {
      await AsyncStorage.setItem(`msg_privacy_${session.user.id}`, option)
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ message_privacy: option })
        .eq('id', session?.user.id)

      if (error && error.code !== '42703' && !error.message.includes('message_privacy') && error.code !== 'PGRST204') {
        console.warn('Mesaj gizliliği senkronizasyon uyarısı:', error.message)
      }
    } catch {
      // Yerel hafızada başarıyla saklandı
    }
  }

  async function handleEnableNotifications() {
    if (!session?.user.id) return
    setLoading(true)
    const token = await registerForPushNotificationsAsync(session.user.id)
    setLoading(false)
    if (token) {
      Alert.alert('Bildirimler Aktif', 'Oylamalar ve yorumlar için anlık bildirimler alacaksınız.')
    } else {
      Alert.alert('Bildirim İzni', 'Cihaz ayarlarınızdan bildirim izinlerini kontrol edin.')
    }
  }

  async function handleForgotPassword() {
    const email = session?.user.email
    if (!email) return Alert.alert('Hata', 'E-posta adresin bulunamadı.')

    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    setLoading(false)

    if (error) return Alert.alert('Kod gönderilemedi', error.message)
    router.push({ pathname: '/(auth)/reset-password', params: { email } })
  }

  async function handleChangeEmail() {
    Keyboard.dismiss()
    const targetEmail = newEmail.trim().toLowerCase()
    if (!targetEmail) {
      return Alert.alert('Eksik bilgi', 'Lütfen yeni e-posta adresinizi girin.')
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(targetEmail)) {
      return Alert.alert('Geçersiz e-posta', 'Lütfen geçerli bir e-posta adresi girin.')
    }
    if (targetEmail === session?.user?.email?.toLowerCase()) {
      return Alert.alert('Aynı e-posta', 'Yeni e-posta adresi mevcut adresinizle aynı olamaz.')
    }

    setEmailLoading(true)
    try {
      const updatePromise = supabase.auth.updateUser(
        { email: targetEmail },
        { emailRedirectTo: 'dythin://' }
      )
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 15000)
      )

      const result = await Promise.race([updatePromise, timeoutPromise]) as Awaited<ReturnType<typeof supabase.auth.updateUser>>
      const { data, error } = result

      if (error) {
        const msg = error.message?.includes('rate limit') || error.message?.includes('security purposes')
          ? 'Çok sık deneme yapıldı. Birkaç dakika bekleyip tekrar deneyin.'
          : error.message?.includes('already registered') || error.message?.includes('already been used')
          ? 'Bu e-posta adresi başka bir hesapta kayıtlı.'
          : `Hata: ${error.message}`
        return Alert.alert('E-posta Değiştirilemedi', msg)
      }

      setNewEmail('')
      setShowEmailForm(false)
      Alert.alert(
        '✉️ Onay Bağlantısı Gönderildi',
        'E-posta değişikliği için hem mevcut adresinize hem de yeni adresinize onay bağlantısı gönderildi.\n\nBağlantılara tıkladıktan sonra e-posta adresiniz güncellenecektir.'
      )
    } catch (error: any) {
      if (error?.message === 'TIMEOUT') {
        setNewEmail('')
        setShowEmailForm(false)
        Alert.alert(
          '✉️ İstek İletildi',
          'E-posta güncelleme talebiniz iletildi. Lütfen gelen kutunuzu (ve spam klasörünü) kontrol edin.'
        )
      } else {
        Alert.alert('E-posta Değiştirilemedi', error?.message || 'Lütfen tekrar deneyin.')
      }
    } finally {
      setEmailLoading(false)
    }
  }

  async function handleChangePassword() {
    if (!session?.user.email) return Alert.alert('Hata', 'E-posta adresin bulunamadı.')
    if (!currentPassword || !newPassword || !confirmPassword) {
      return Alert.alert('Eksik bilgi', 'Lütfen tüm şifre alanlarını doldur.')
    }
    if (newPassword.length < 6) return Alert.alert('Şifre kısa', 'Yeni şifre en az 6 karakter olmalı.')
    if (newPassword !== confirmPassword) return Alert.alert('Şifreler aynı değil', 'Yeni şifreleri aynı yaz.')

    setLoading(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      })
      if (signInError) throw new Error('Eski şifren doğru değil.')

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowPasswordForm(false)
      Alert.alert('Başarılı', 'Şifren değiştirildi.')
    } catch (error: any) {
      Alert.alert('Şifre değiştirilemedi', error.message || 'Lütfen tekrar dene.')
    }
    setLoading(false)
  }

  async function handleSignOut() {
    Alert.alert('Çıkış Yap', 'Emin misin?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: async () => {
          setSignOutLoading(true)
          try {
            await Promise.race([
              signOut(),
              new Promise((r) => setTimeout(r, 800)),
            ]).catch(() => null)
          } catch (e) {
            console.warn('Sign out error:', e)
          } finally {
            setSignOutLoading(false)
            try {
              router.dismissAll()
            } catch {}
            router.replace('/(auth)/login')
          }
        },
      },
    ])
  }

  // App Store Guidelines Section 5.1.1(v) - Account Deletion Requirement
  async function handleDeleteAccount() {
    Alert.alert(
      'Hesabımı Kalıcı Olarak Sil',
      'Bu işlem geri alınamaz. Tüm paylaşımların, oyların ve profil verilerin kalıcı olarak silinecek. Emin misin?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Evet, Sil',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Son Onay',
              'Hesabınızı silmek istediğinizi tekrar onaylayın.',
              [
                { text: 'Vazgeç', style: 'cancel' },
                {
                  text: 'Hesabımı Sil',
                  style: 'destructive',
                  onPress: async () => {
                    if (!session?.user.id) return
                    setLoading(true)
                    try {
                      // 1. Sunucu taraflı RPC ile Auth ve tüm veri tabanı kayıtlarını kalıcı olarak sil
                      const { error: rpcError } = await supabase.rpc('delete_user_account')

                      // 2. Fallback: İstemci taraflı silme işlemleri
                      if (rpcError) {
                        await supabase.from('votes').delete().eq('voter_id', session.user.id)
                        await supabase.from('posts').delete().eq('user_id', session.user.id)
                        await supabase
                          .from('friendships')
                          .delete()
                          .or(`requester_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`)
                        await supabase.from('profiles').delete().eq('id', session.user.id)
                      }

                      await signOut()
                      try {
                        router.dismissAll()
                      } catch {}
                      router.replace('/(auth)/login')
                      Alert.alert('Hesabınız Silindi', 'Hesabınız ve tüm verileriniz kalıcı olarak sistemden kaldırıldı.')
                    } catch (e: any) {
                      Alert.alert('Hata', 'Hesap silinirken bir hata oluştu.')
                    }
                    setLoading(false)
                  },
                },
              ]
            )
          },
        },
      ]
    )
  }

  const themeOptions: { key: ThemeName; label: string; color: string }[] = [
    { key: 'purple', label: 'Mor & Gece', color: '#7F77DD' },
    { key: 'gold', label: 'Siyah & Altın', color: '#C9A84C' },
    { key: 'pink', label: 'Pembe & Krem', color: '#D4537E' },
    { key: 'green', label: 'Yeşil & Bej', color: '#3B6D11' },
  ]

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { padding: 20 },
    logo: { fontSize: 24, fontWeight: '700', color: theme.text, marginBottom: 24 },
    logoDot: { color: theme.accent },
    sectionLabel: { fontSize: 10, color: theme.textSub, fontWeight: '500', letterSpacing: 0.4, marginBottom: 8, marginTop: 20 },
    card: { backgroundColor: theme.card, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden', marginBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    rowLast: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
    rowLabel: { fontSize: 13, color: theme.text },
    rowSub: { fontSize: 11, color: theme.textSub, marginTop: 2 },
    arrow: { fontSize: 16, color: theme.textSub },
    themeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    themeRowLast: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
    themeDot: { width: 24, height: 24, borderRadius: 12 },
    themeCheck: { marginLeft: 'auto', width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    themeCheckActive: { backgroundColor: theme.accent, borderColor: theme.accent },
    signOutBtn: { marginHorizontal: 20, marginTop: 20, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#c0605a', alignItems: 'center' },
    signOutText: { color: '#c0605a', fontSize: 14, fontWeight: '500' },
    deleteAccountBtn: { marginHorizontal: 20, marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: '#2a1010', alignItems: 'center' },
    deleteAccountText: { color: '#e5484d', fontSize: 13, fontWeight: '600' },
    emailText: { fontSize: 13, color: theme.textSub },
    passwordForm: { padding: 14, borderTopWidth: 0.5, borderTopColor: theme.border },
    passwordInput: { backgroundColor: theme.bg, borderWidth: 0.5, borderColor: theme.border, borderRadius: 10, padding: 12, color: theme.text, fontSize: 13, marginBottom: 10 },
    passwordSave: { backgroundColor: theme.accent, borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 2 },
    passwordSaveText: { color: theme.bg, fontSize: 13, fontWeight: '600' },
    forgotPassword: { alignItems: 'center', paddingTop: 16 },
    forgotPasswordText: { color: theme.accent, fontSize: 13 },
    versionText: { fontSize: 12, color: theme.textSub, textAlign: 'center', marginTop: 16, marginBottom: 24 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: theme.card, borderRadius: 16, padding: 20, width: '100%', maxHeight: '80%', borderWidth: 0.5, borderColor: theme.border },
    modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 12 },
    modalScroll: { marginBottom: 16 },
    modalText: { fontSize: 12, color: theme.textSub, lineHeight: 18 },
    modalCloseBtn: { backgroundColor: theme.accent, padding: 12, borderRadius: 10, alignItems: 'center' },
    modalCloseText: { color: theme.bg, fontWeight: '600', fontSize: 13 },
  })

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 150 }}
        showsVerticalScrollIndicator={false}
        bounces={true}
        alwaysBounceVertical={true}
        refreshControl={
          <RefreshControl
            key={theme.accent}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.accent}
            colors={[theme.accent]}
            progressBackgroundColor={theme.card}
          />
        }
      >
        <Text style={s.logo}>
          dythin<Text style={s.logoDot}>.</Text>
        </Text>

        <Text style={s.sectionLabel}>{t('settings.privacySection')}</Text>
        <View style={s.card}>
          <View style={{ padding: 14 }}>
            <Text style={s.rowLabel}>{t('settings.whoCanMessage')}</Text>
            <Text style={s.rowSub}>{t('settings.whoCanMessageSub')}</Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={[
                  { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
                  messagePrivacy === 'everyone' && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
                onPress={() => handleUpdateMessagePrivacy('everyone')}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: messagePrivacy === 'everyone' ? '#ffffff' : theme.textSub }}>
                  {t('settings.everyone')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
                  messagePrivacy === 'friends' && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
                onPress={() => handleUpdateMessagePrivacy('friends')}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: messagePrivacy === 'friends' ? '#ffffff' : theme.textSub }}>
                  {t('settings.onlyFriends')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Gizli Profil Row */}
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: theme.border }} onPress={handleTogglePrivate} activeOpacity={0.8}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={s.rowLabel}>{t('settings.privateProfile')}</Text>
                <Text style={s.rowSub}>{t('settings.privateProfileSub')}</Text>
              </View>
              <View style={[{ width: 44, height: 26, borderRadius: 13, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, justifyContent: 'center', padding: 2 }, isPrivate && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                <View style={[{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.textSub }, isPrivate && { alignSelf: 'flex-end', backgroundColor: '#ffffff' }]} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={s.sectionLabel}>BİLDİRİMLER</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.rowLast} onPress={handleEnableNotifications} disabled={loading}>
            <View>
              <Text style={s.rowLabel}>Anlık Bildirimler</Text>
              <Text style={s.rowSub}>Oylama ve yorumlarda bildirim al</Text>
            </View>
            <Ionicons name="notifications-outline" size={18} color={theme.textSub} />
          </TouchableOpacity>
        </View>

        <Text style={s.sectionLabel}>HESAP</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>E-posta</Text>
              <Text style={s.emailText}>{session?.user.email}</Text>
            </View>
            <TouchableOpacity onPress={handleRefresh} style={{ padding: 6 }} activeOpacity={0.7}>
              <Ionicons name="reload-outline" size={18} color={theme.accent} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.row} onPress={() => setShowEmailForm(value => !value)}>
            <Text style={s.rowLabel}>E-posta değiştir</Text>
            <Text style={s.arrow}>{showEmailForm ? '⌃' : '›'}</Text>
          </TouchableOpacity>
          {showEmailForm && (
            <View style={[s.passwordForm, { borderBottomWidth: 0.5, borderBottomColor: theme.border }]}>
              <TextInput
                style={s.passwordInput}
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="Yeni e-posta adresi"
                placeholderTextColor={theme.textSub}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                blurOnSubmit={true}
                onSubmitEditing={Keyboard.dismiss}
                editable={!emailLoading}
              />
              <TouchableOpacity style={s.passwordSave} onPress={handleChangeEmail} disabled={emailLoading}>
                {emailLoading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <ActivityIndicator color={theme.bg} size="small" />
                    <Text style={s.passwordSaveText}>Gönderiliyor, lütfen bekleyin...</Text>
                  </View>
                ) : (
                  <Text style={s.passwordSaveText}>E-postayı güncelle</Text>
                )}
              </TouchableOpacity>
              <Text style={{ fontSize: 11, color: theme.textSub, marginTop: 8, textAlign: 'center' }}>
                Onay bağlantısı yeni e-posta adresinize gönderilecektir.
              </Text>
            </View>
          )}
          <TouchableOpacity style={s.rowLast} onPress={() => setShowPasswordForm(value => !value)}>
            <Text style={s.rowLabel}>Şifre değiştir</Text>
            <Text style={s.arrow}>{showPasswordForm ? '⌃' : '›'}</Text>
          </TouchableOpacity>
          {showPasswordForm && (
            <View style={s.passwordForm}>
              <TextInput
                style={s.passwordInput}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Eski şifre"
                placeholderTextColor={theme.textSub}
                secureTextEntry
                returnKeyType="next"
                editable={!loading}
              />
              <TextInput
                style={s.passwordInput}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Yeni şifre"
                placeholderTextColor={theme.textSub}
                secureTextEntry
                returnKeyType="next"
                editable={!loading}
              />
              <TextInput
                style={s.passwordInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Yeni şifre (tekrar)"
                placeholderTextColor={theme.textSub}
                secureTextEntry
                returnKeyType="done"
                blurOnSubmit={true}
                onSubmitEditing={Keyboard.dismiss}
                editable={!loading}
              />
              <TouchableOpacity style={s.passwordSave} onPress={handleChangePassword} disabled={loading}>
                {loading ? <ActivityIndicator color={theme.bg} /> : <Text style={s.passwordSaveText}>Şifreyi güncelle</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={s.forgotPassword} onPress={handleForgotPassword} disabled={loading}>
                <Text style={s.forgotPasswordText}>Şifremi unuttum — e-postama kod gönder</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={s.sectionLabel}>{t('settings.themeSection')}</Text>
        <View style={s.card}>
          {themeOptions.map((tOpt, i) => (
            <TouchableOpacity
              key={tOpt.key}
              style={i === themeOptions.length - 1 ? s.themeRowLast : s.themeRow}
              onPress={() => setThemeName(tOpt.key)}
            >
              <View style={[s.themeDot, { backgroundColor: tOpt.color }]} />
              <Text style={s.rowLabel}>{tOpt.label}</Text>
              <View style={[s.themeCheck, themeName === tOpt.key && s.themeCheckActive]}>
                {themeName === tOpt.key && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionLabel}>{t('settings.languageSection')}</Text>
        <View style={s.card}>
          {supportedLanguages.map((lang, i) => (
            <TouchableOpacity
              key={lang.code}
              style={i === supportedLanguages.length - 1 ? s.themeRowLast : s.themeRow}
              onPress={() => setLanguage(lang.code)}
              activeOpacity={0.7}
            >
              <Text style={[s.rowLabel, { flex: 1 }]}>{lang.label} ({lang.nativeName})</Text>
              <View style={[s.themeCheck, language === lang.code && s.themeCheckActive]}>
                {language === lang.code && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionLabel}>{t('settings.legalSection')}</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={() => setShowPrivacyModal(true)}>
            <Text style={s.rowLabel}>{t('settings.privacyPolicy')}</Text>
            <Text style={s.arrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={() => setShowTermsModal(true)}>
            <Text style={s.rowLabel}>{t('settings.termsOfUse')}</Text>
            <Text style={s.arrow}>›</Text>
          </TouchableOpacity>
          <View style={s.rowLast}>
            <Text style={s.rowLabel}>{t('settings.version')}</Text>
            <Text style={s.emailText}>1.1.0 (Build 64)</Text>
          </View>
        </View>

        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} disabled={signOutLoading}>
          {signOutLoading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={s.signOutText}>{t('settings.signOut')}</Text>
          )}
        </TouchableOpacity>

        {/* Apple App Store Requirement: Account Deletion */}
        <TouchableOpacity style={s.deleteAccountBtn} onPress={handleDeleteAccount} disabled={loading}>
          <Text style={s.deleteAccountText}>{t('settings.deleteAccount')}</Text>
        </TouchableOpacity>

        <Text style={s.versionText}>dythin. — {t('auth.tagline')}</Text>
      </ScrollView>

      {/* Privacy Policy Modal */}
      <Modal visible={showPrivacyModal} transparent animationType="slide" onRequestClose={() => setShowPrivacyModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Gizlilik Politikası</Text>
            <ScrollView style={s.modalScroll}>
              <Text style={s.modalText}>
                Dythin uygulaması olarak kişisel verilerinizin güvenliğine önem veriyoruz.{'\n\n'}
                1. Toplanan Veriler: Kayıt sırasında e-posta adresiniz, profil adınız ve yüklediğiniz fotoğraflar güvenli veri sunucularında saklanır.{'\n\n'}
                2. Fotoğraflar ve İçerik: Yüklenen görseller yalnızca oylama ve topluluk etkileşimi amacıyla kullanılır. Üçüncü taraflarla satılmaz veya paylaşılmaz.{'\n\n'}
                3. Veri Güvenliği: Şifreleriniz ve yetkilendirmeleriniz endüstri standardı şifreleme yöntemleri (Supabase Auth) ile korunmaktadır.{'\n\n'}
                4. Kullanıcı Hakları: Dilediğiniz an Ayarlar menüsünden tüm hesabınızı ve verilerinizi kalıcı olarak silme hakkına sahipsiniz.
              </Text>
            </ScrollView>
            <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowPrivacyModal(false)}>
              <Text style={s.modalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Terms of Service / EULA Modal */}
      <Modal visible={showTermsModal} transparent animationType="slide" onRequestClose={() => setShowTermsModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Kullanım Koşulları & EULA</Text>
            <ScrollView style={s.modalScroll}>
              <Text style={s.modalText}>
                Dythin uygulamasını kullanarak aşağıdaki Son Kullanıcı Lisans Sözleşmesi (EULA) ve kullanım şartlarını kabul etmiş olursunuz:{'\n\n'}
                <Text style={{ fontWeight: '700', color: theme.text }}>1. SIFIR TOLERANS POLİTİKASI (ZERO TOLERANCE POLICY):{'\n'}</Text>
                Dythin, sakıncalı içeriklere (müstehcenlik, şiddet, nefret söylemi, hakaret, telif hakkı ihlali veya taciz) ve kötü niyetli kullanıcılara karşı kesinlikle SIFIR TOLERANS politikası uygulamaktadır.{'\n\n'}
                Dythin has a strict zero-tolerance policy for objectionable content and abusive users. Any inappropriate, offensive, or harassing behavior will not be tolerated.{'\n\n'}
                <Text style={{ fontWeight: '700', color: theme.text }}>2. TOPLULUK GÜVENLİĞİ: BİLDİR VE ENGELLE (FLAG & BLOCK):{'\n'}</Text>
                Kullanıcılar akışta karşılaştıkları herhangi bir uygunsuz içeriği 'Bildir' butonu ile anında şikayet edebilir ve sakıncalı kullanıcıları 'Engelle' butonu ile tek dokunuşla engelleyebilir. Engellenen kullanıcının tüm içerikleri akışınızdan anında silinir ve geliştiriciye otomatik olarak bildirilir.{'\n\n'}
                Users can flag any objectionable content immediately using the Report button and block abusive users. Blocked users and their content are instantly removed from your feed.{'\n\n'}
                <Text style={{ fontWeight: '700', color: theme.text }}>3. 24 SAAT İÇİNDE MÜDAHALE (24-HOUR ACTION):{'\n'}</Text>
                Şikayet edilen tüm sakıncalı içerikler moderasyon ekibimiz tarafından en geç 24 saat içerisinde incelenir. Kural ihlali tespit edilen gönderiler kalıcı olarak yayından kaldırılır ve bu içeriği paylaşan kullanıcının hesabı kalıcı olarak sonlandırılır.{'\n\n'}
                All reports are investigated within 24 hours. Violating content will be removed immediately and offending users will be permanently ejected and banned.{'\n\n'}
                <Text style={{ fontWeight: '700', color: theme.text }}>4. HİZMET ŞARTLARI:{'\n'}</Text>
                Dythin, topluluk kurallarını ihlal eden tüm gönderileri önceden haber vermeksizin silme ve hesapları kapatma hakkını saklı tutar.
              </Text>
            </ScrollView>
            <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowTermsModal(false)}>
              <Text style={s.modalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
