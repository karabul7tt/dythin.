import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Keyboard,
  Modal,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getCleanErrorMessage } from '../../lib/errors'
import { sanitizeInput, validateInstagramUsername } from '../../lib/security'

export default function Login() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [isRegister, setIsRegister] = useState(false)
  const [showOtpScreen, setShowOtpScreen] = useState(false)
  const [attemptCount, setAttemptCount] = useState(0)
  const [cooldown, setCooldown] = useState(0)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)

  // Rate Limiting Cooldown Timer (Giriş Deneme Sınırlayıcı)
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown(prev => (prev > 1 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const [phone, setPhone] = useState('')

  function handleForgotPassword() {
    router.push({
      pathname: '/(auth)/reset-password',
      params: { identifier: email.trim() },
    })
  }

  async function handleAuth() {
    if (cooldown > 0) {
      Alert.alert('Güvenlik Kısıtlaması 🔒', `Çok fazla hatalı deneme yapıldı. Lütfen ${cooldown} saniye bekleyin.`)
      return
    }

    const inputIdentifier = email.trim()
    if (!inputIdentifier || !password.trim()) {
      Alert.alert('Hata', isRegister ? 'E-posta ve şifre gereklidir.' : 'E-posta, Telefon veya Kullanıcı Adı ve şifre gereklidir.')
      return
    }

    if (isRegister) {
      const cleanFullName = sanitizeInput(fullName)
      const usernameValidation = validateInstagramUsername(username)

      if (!cleanFullName) {
        Alert.alert('Hata', 'Ad ve Soyad alanı zorunludur.')
        return
      }
      if (!usernameValidation.valid) {
        Alert.alert('Geçersiz Kullanıcı Adı', usernameValidation.error)
        return
      }
      if (!inputIdentifier.includes('@')) {
        Alert.alert('Hata', 'Lütfen geçerli bir e-posta adresi girin.')
        return
      }
      if (!confirmPassword.trim()) {
        Alert.alert('Hata', 'Lütfen şifrenizi tekrar girin.')
        return
      }
      if (password !== confirmPassword) {
        Alert.alert('Hata', 'Şifreler eşleşmiyor. Lütfen aynı şifreyi tekrar girin.')
        return
      }
      if (password.length < 6) {
        Alert.alert('Hata', 'Şifreniz en az 6 karakter olmalıdır.')
        return
      }
    }

    setLoading(true)
    try {
      if (isRegister) {
        const cleanFullName = sanitizeInput(fullName)
        const cleanUsername = validateInstagramUsername(username).cleanUsername
        const cleanPhone = phone.trim()

        // Benzersiz Kullanıcı Adı Denetimi (Case-Insensitive)
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', cleanUsername)
          .maybeSingle()

        if (existingUser) {
          setLoading(false)
          return Alert.alert(
            'Kullanıcı Adı Alınmış',
            'Bu kullanıcı adı başka bir üye tarafından kullanılıyor. Lütfen farklı bir kullanıcı adı seçin.'
          )
        }

        const { data, error } = await supabase.auth.signUp({
          email: inputIdentifier,
          password,
          options: {
            data: {
              full_name: cleanFullName,
              username: cleanUsername,
              phone: cleanPhone,
            },
          },
        })
        if (error) {
          const nextAttempts = attemptCount + 1
          setAttemptCount(nextAttempts)
          if (nextAttempts >= 5) {
            setCooldown(30)
            setAttemptCount(0)
            Alert.alert('Güvenlik Kısıtlaması 🔒', 'Üst üste 5 kez hatalı işlem yapıldı. 30 saniye kısıtlama getirildi.')
          } else {
            Alert.alert('Kayıt Oluşturulamadı', getCleanErrorMessage(error))
          }
        } else {
          setAttemptCount(0)
          if (data.user) {
            await supabase
              .from('profiles')
              .upsert({
                id: data.user.id,
                username: cleanUsername,
                full_name: cleanFullName,
                email: inputIdentifier,
              })
          }
          if (data.session) {
            Alert.alert('Hoş geldin! 🎉', 'Hesabın oluşturuldu ve giriş yapıldı.')
          } else {
            setShowOtpScreen(true)
            Alert.alert(
              'Doğrulama Kodu Gönderildi! 📩',
              `${inputIdentifier} adresinize 6 haneli doğrulama kodu gönderildi. Lütfen gelen kutunuzu kontrol edin.`
            )
          }
        }
      } else {
        // Giriş Modu: E-posta, Telefon veya Kullanıcı Adı ile Akıllı Çözümleme
        let targetEmail = inputIdentifier

        // Eğer kullanıcı adı girildiyse (içinde @ yoksa)
        if (!inputIdentifier.includes('@')) {
          const { data: foundProfile } = await supabase
            .from('profiles')
            .select('id, username, email')
            .ilike('username', inputIdentifier.replace(/^@/, ''))
            .single()

          if (foundProfile?.email) {
            targetEmail = foundProfile.email
          } else {
            setLoading(false)
            return Alert.alert('Kullanıcı Bulunamadı', 'Bu kullanıcı adıyla kayıtlı bir hesap bulunamadı. Lütfen e-posta adresinizle giriş yapın.')
          }
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: targetEmail,
          password,
        })

        if (error) {
          const nextAttempts = attemptCount + 1
          setAttemptCount(nextAttempts)
          if (nextAttempts >= 5) {
            setCooldown(30)
            setAttemptCount(0)
            Alert.alert('Güvenlik Kısıtlaması 🔒', 'Üst üste 5 kez hatalı şifre girildi. Güvenliğiniz için 30 saniye kısıtlama getirildi.')
          } else {
            Alert.alert('Giriş Başarısız', 'E-posta, telefon, kullanıcı adı veya şifreniz hatalı. Lütfen kontrol edin.')
          }
        } else {
          setAttemptCount(0)
        }
      }
    } catch (e: unknown) {
      Alert.alert('Hata', getCleanErrorMessage(e))
    }
    setLoading(false)
  }

  async function handleVerifyOtp() {
    const cleanToken = otpCode.trim()
    if (!cleanToken || cleanToken.length < 6) {
      Alert.alert('Eksik Kod', 'Lütfen e-postanıza gelen doğrulama kodunu girin.')
      return
    }

    setLoading(true)
    try {
      let { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanToken,
        type: 'signup',
      })

      if (error) {
        // Fallback to type email
        const res = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: cleanToken,
          type: 'email',
        })
        data = res.data
        error = res.error
      }

      if (error) {
        Alert.alert('Doğrulama Başarısız', 'Girdiğiniz doğrulama kodu geçersiz veya süresi dolmuş. Lütfen tekrar deneyin.')
      } else {
        if (data.user) {
          await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              username: sanitizeInput(username),
              full_name: sanitizeInput(fullName),
            })
        }

        // 6-8 haneli kod doğrulandıktan sonra otomatik giriş yap
        if (password) {
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          })
        }

        Alert.alert('Hesap Oluşturuldu! 🎉', 'E-posta adresiniz doğrulandı ve giriş yapıldı.')
        setShowOtpScreen(false)
        setIsRegister(false)
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Kod doğrulanamadı.')
    }
    setLoading(false)
  }

  const inputStyle = {
    backgroundColor: '#161622',
    borderWidth: 0.5,
    borderColor: '#2a2a3a',
    borderRadius: 14,
    padding: 16,
    fontSize: 15,
    color: '#fff',
    marginBottom: 12,
  } as const

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0e0e1a' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={{ fontSize: 42, fontWeight: '700', color: '#f0f0f0', textAlign: 'center', marginBottom: 6 }}>
            dythin<Text style={{ color: '#7F77DD' }}>.</Text>
          </Text>
          <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 36 }}>
            kararsızlıktan kurtar kendini
          </Text>

          {showOtpScreen ? (
            /* E-POSTA DOĞRULAMA KODU EKRANI */
            <View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 8 }}>
                E-Posta Doğrulama Kodu
              </Text>
              <Text style={{ fontSize: 13, color: '#aaa', textAlign: 'center', marginBottom: 20 }}>
                {email} adresinize gönderilen doğrulama kodunu girin.
              </Text>

              <TextInput
                style={[inputStyle, { fontSize: 20, letterSpacing: 4, textAlign: 'center' }]}
                value={otpCode}
                onChangeText={setOtpCode}
                placeholder="Doğrulama Kodu"
                placeholderTextColor="#444"
                keyboardType="number-pad"
                maxLength={8}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                editable={!loading}
              />

              <TouchableOpacity
                style={{ backgroundColor: '#7F77DD', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 14, marginTop: 6 }}
                onPress={handleVerifyOtp}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Kodu Doğrula ve Giriş Yap</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={{ alignItems: 'center', padding: 10 }}
                onPress={() => setShowOtpScreen(false)}
                disabled={loading}
              >
                <Text style={{ color: '#aaa', fontSize: 13 }}>← Geri Dön</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* GİRİŞ YAR VE KAYIT OL FORMU */
            <>
              {/* KAYIT MODUNDA: AD SOYAD VE KULLANICI ADI */}
              {isRegister && (
                <>
                  <TextInput
                    style={inputStyle}
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Ad Soyad"
                    placeholderTextColor="#555"
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="next"
                    editable={!loading}
                  />

                  <TextInput
                    style={inputStyle}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Kullanıcı adı"
                    placeholderTextColor="#555"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    editable={!loading}
                  />
                </>
              )}

              {/* GİRİŞ ALANI (E-POSTA, TELEFON VEYA KULLANICI ADI) */}
              <TextInput
                style={inputStyle}
                value={email}
                onChangeText={setEmail}
                placeholder={isRegister ? "E-posta Adresi" : "E-posta, Telefon veya Kullanıcı Adı"}
                placeholderTextColor="#555"
                keyboardType={isRegister ? "email-address" : "default"}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                editable={!loading}
              />

              {/* KAYIT MODUNDA: TELEFON NUMARASI */}
              {isRegister && (
                <TextInput
                  style={inputStyle}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Telefon Numarası (İsteğe Bağlı)"
                  placeholderTextColor="#555"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  editable={!loading}
                />
              )}

              {/* ŞİFRE ALANI */}
              <TextInput
                style={inputStyle}
                value={password}
                onChangeText={setPassword}
                placeholder="Şifre"
                placeholderTextColor="#555"
                secureTextEntry
                returnKeyType={isRegister ? "next" : "done"}
                onSubmitEditing={() => {
                  if (!isRegister) Keyboard.dismiss()
                }}
                editable={!loading}
              />

              {/* KAYIT MODUNDA: ŞİFREYİ TEKRAR GİRİN */}
              {isRegister && (
                <TextInput
                  style={inputStyle}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Şifreyi Tekrar Girin"
                  placeholderTextColor="#555"
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  editable={!loading}
                />
              )}

              <TouchableOpacity
                style={{ backgroundColor: '#7F77DD', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16, marginTop: 4 }}
                onPress={handleAuth}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{isRegister ? 'Kayıt Ol' : 'Giriş Yap'}</Text>
                }
              </TouchableOpacity>

              {isRegister && (
                <Text style={{ color: '#888', fontSize: 11, textAlign: 'center', marginTop: 4, marginBottom: 8, lineHeight: 16 }}>
                  Kayıt olarak{' '}
                  <Text style={{ color: '#7F77DD', textDecorationLine: 'underline' }} onPress={() => setShowTermsModal(true)}>
                    Kullanım Koşulları
                  </Text>
                  {' '}ve{' '}
                  <Text style={{ color: '#7F77DD', textDecorationLine: 'underline' }} onPress={() => setShowPrivacyModal(true)}>
                    Gizlilik Politikası
                  </Text>
                  {"'"}nı kabul etmiş olursunuz.
                </Text>
              )}

              {!isRegister && (
                <TouchableOpacity
                  style={{ marginBottom: 8, alignItems: 'center' }}
                  onPress={handleForgotPassword}
                  disabled={loading}
                >
                  <Text style={{ color: '#aaa', fontSize: 14 }}>Şifremi unuttum</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={{ marginTop: 8, alignItems: 'center' }}
                onPress={() => {
                  setIsRegister(!isRegister)
                  setFullName('')
                  setUsername('')
                  setPassword('')
                  setConfirmPassword('')
                }}
                disabled={loading}
              >
                <Text style={{ color: '#7F77DD', fontSize: 14 }}>
                  {isRegister ? 'Hesabın var mı? Giriş Yap' : 'Hesabın yok mu? Kayıt Ol'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Gizlilik Politikası Modal */}
      <Modal visible={showPrivacyModal} transparent animationType="slide" onRequestClose={() => setShowPrivacyModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a1a2e', borderRadius: 16, padding: 20, width: '100%', maxHeight: '80%', borderWidth: 0.5, borderColor: '#333' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 12 }}>Gizlilik Politikası</Text>
            <ScrollView style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: '#aaa', lineHeight: 18 }}>
                Dythin uygulaması olarak kişisel verilerinizin güvenliğine önem veriyoruz.{'\n\n'}
                1. Toplanan Veriler: Kayıt sırasında e-posta adresiniz, profil adınız ve yüklediğiniz fotoğraflar güvenli veri sunucularında saklanır.{'\n\n'}
                2. Fotoğraflar ve İçerik: Yüklenen görseller yalnızca oylama ve topluluk etkileşimi amacıyla kullanılır. Üçüncü taraflarla satılmaz veya paylaşılmaz.{'\n\n'}
                3. Veri Güvenliği: Şifreleriniz ve yetkilendirmeleriniz endüstri standardı şifreleme yöntemleri (Supabase Auth) ile korunmaktadır.{'\n\n'}
                4. Kullanıcı Hakları: Dilediğiniz an Ayarlar menüsünden tüm hesabınızı ve verilerinizi kalıcı olarak silme hakkına sahipsiniz.
              </Text>
            </ScrollView>
            <TouchableOpacity style={{ backgroundColor: '#7F77DD', padding: 12, borderRadius: 10, alignItems: 'center' }} onPress={() => setShowPrivacyModal(false)}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Kullanım Koşulları & EULA Modal */}
      <Modal visible={showTermsModal} transparent animationType="slide" onRequestClose={() => setShowTermsModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a1a2e', borderRadius: 16, padding: 20, width: '100%', maxHeight: '80%', borderWidth: 0.5, borderColor: '#333' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 12 }}>Kullanım Koşulları & EULA</Text>
            <ScrollView style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: '#aaa', lineHeight: 18 }}>
                Dythin uygulamasını kullanarak aşağıdaki kuralları kabul etmiş olursunuz:{'\n\n'}
                1. Uygunsuz İçerik Yasağı: Çıplaklık, şiddet, nefret söylemi, telif hakkı ihlali veya taciz içeren görseller ve yorumlar kesinlikle yasaktır.{'\n\n'}
                2. Topluluk Denetimi (Moderasyon): Uygunsuz içerikleri veya kullanıcıları gönderi üzerindeki 'Bildir' ve 'Engelle' butonları ile raporlayabilirsiniz.{'\n\n'}
                3. Sıfır Tolerans Politikası: Raporlanan sakıncalı içerikler ve kuralları ihlal eden kullanıcı hesapları 24 saat içerisinde incelenerek kalıcı olarak engellenir.{'\n\n'}
                4. Hizmet Şartları: Dythin kurallara uymayan paylaşımları kaldırma hakkını saklı tutar.
              </Text>
            </ScrollView>
            <TouchableOpacity style={{ backgroundColor: '#7F77DD', padding: 12, borderRadius: 10, alignItems: 'center' }} onPress={() => setShowTermsModal(false)}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
