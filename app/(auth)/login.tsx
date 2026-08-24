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
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { getCleanErrorMessage } from '../../lib/errors'
import { sanitizeInput } from '../../lib/security'

export default function Login() {
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

  // Rate Limiting Cooldown Timer (Giriş Deneme Sınırlayıcı)
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown(prev => (prev > 1 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const [phone, setPhone] = useState('')

  async function handleForgotPassword() {
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      Alert.alert('E-posta gerekli', 'Şifre sıfırlama kodu göndermek için önce e-posta adresinizi yazın.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail)
    setLoading(false)
    if (error) {
      Alert.alert('Kod gönderilemedi', error.message)
      return
    }
    Alert.alert('Kod gönderildi!', `${normalizedEmail} adresine 6 haneli doğrulama kodu gönderildi.`)
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
      const cleanUsername = sanitizeInput(username)

      if (!cleanFullName) {
        Alert.alert('Hata', 'Ad ve Soyad alanı zorunludur.')
        return
      }
      if (!cleanUsername) {
        Alert.alert('Hata', 'Kullanıcı adı zorunludur.')
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
        const cleanUsername = sanitizeInput(username)
        const cleanPhone = phone.trim()

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
            .select('id, username')
            .ilike('username', inputIdentifier.replace(/^@/, ''))
            .single()

          // Normal e-posta ile oturum açmayı dene
          targetEmail = inputIdentifier
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
    </SafeAreaView>
  )
}
