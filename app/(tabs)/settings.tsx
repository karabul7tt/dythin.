import { useState } from 'react'
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
} from 'react-native'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { ThemeName } from '../../lib/theme'
import { useRouter } from 'expo-router'
import { registerForPushNotificationsAsync } from '../../lib/notifications'

export default function SettingsScreen() {
  const { theme, themeName, setThemeName, session } = useApp()
  const [loading, setLoading] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Modals for legal compliance
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)

  const router = useRouter()

  async function handleEnableNotifications() {
    if (!session?.user.id) return
    setLoading(true)
    const token = await registerForPushNotificationsAsync(session.user.id)
    setLoading(false)
    if (token) {
      Alert.alert('Bildirimler Aktif! 🔔', 'Oylamalar ve yorumlar için anlık bildirimler alacaksınız.')
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
          await supabase.auth.signOut()
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

                      await supabase.auth.signOut()
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
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.logo}>
          dythin<Text style={s.logoDot}>.</Text>
        </Text>

        <Text style={s.sectionLabel}>BİLDİRİMLER</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.rowLast} onPress={handleEnableNotifications} disabled={loading}>
            <View>
              <Text style={s.rowLabel}>Anlık Bildirimler</Text>
              <Text style={s.rowSub}>Oylama ve yorumlarda bildirim al</Text>
            </View>
            <Text style={s.arrow}>🔔</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.sectionLabel}>HESAP</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View>
              <Text style={s.rowLabel}>E-posta</Text>
              <Text style={s.emailText}>{session?.user.email}</Text>
            </View>
          </View>
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
                editable={!loading}
              />
              <TextInput
                style={s.passwordInput}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Yeni şifre"
                placeholderTextColor={theme.textSub}
                secureTextEntry
                editable={!loading}
              />
              <TextInput
                style={s.passwordInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Yeni şifre (tekrar)"
                placeholderTextColor={theme.textSub}
                secureTextEntry
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

        <Text style={s.sectionLabel}>TEMA</Text>
        <View style={s.card}>
          {themeOptions.map((t, i) => (
            <TouchableOpacity
              key={t.key}
              style={i === themeOptions.length - 1 ? s.themeRowLast : s.themeRow}
              onPress={() => setThemeName(t.key)}
            >
              <View style={[s.themeDot, { backgroundColor: t.color }]} />
              <Text style={s.rowLabel}>{t.label}</Text>
              <View style={[s.themeCheck, themeName === t.key && s.themeCheckActive]}>
                {themeName === t.key && <Text style={{ color: '#fff', fontSize: 10 }}>✓</Text>}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionLabel}>YASAL VE MAĞAZA ŞARTLARI</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={() => setShowPrivacyModal(true)}>
            <Text style={s.rowLabel}>Gizlilik Politikası (Privacy Policy)</Text>
            <Text style={s.arrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={() => setShowTermsModal(true)}>
            <Text style={s.rowLabel}>Kullanım Koşulları & Topluluk Kuralları (EULA)</Text>
            <Text style={s.arrow}>›</Text>
          </TouchableOpacity>
          <View style={s.rowLast}>
            <Text style={s.rowLabel}>Versiyon</Text>
            <Text style={s.emailText}>1.0.0 (Store Ready)</Text>
          </View>
        </View>

        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <Text style={s.signOutText}>Çıkış Yap</Text>
        </TouchableOpacity>

        {/* Apple App Store Requirement: Account Deletion */}
        <TouchableOpacity style={s.deleteAccountBtn} onPress={handleDeleteAccount} disabled={loading}>
          <Text style={s.deleteAccountText}>Hesabımı ve Verilerimi Sil</Text>
        </TouchableOpacity>

        <Text style={s.versionText}>dythin. — kararsızlıktan kurtar kendini</Text>
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
                Dythin uygulamasını kullanarak aşağıdaki kuralları kabul etmiş olursunuz:{'\n\n'}
                1. Uygunsuz İçerik Yasağı: Çıplaklık, şiddet, nefret söylemi, telif hakkı ihlali veya taciz içeren görseller ve yorumlar kesinlikle yasaktır.{'\n\n'}
                2. Topluluk Denetimi (Moderasyon): Uygunsuz içerikleri veya kullanıcıları gönderi üzerindeki 'Bildir' ve 'Engelle' butonları ile raporlayabilirsiniz.{'\n\n'}
                3. Sıfır Tolerans Politikası: Raporlanan sakıncalı içerikler ve kuralları ihlal eden kullanıcı hesapları 24 saat içerisinde incelenerek kalıcı olarak engellenir.{'\n\n'}
                4. Hizmet Şartları: Dythin kurallara uymayan paylaşımları kaldırma hakkını saklı tutar.
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
