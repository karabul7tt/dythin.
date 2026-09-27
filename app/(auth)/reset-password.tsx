import { useState, useEffect } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getCleanErrorMessage } from '../../lib/errors'

export default function ResetPassword() {
  const params = useLocalSearchParams<{ email?: string; identifier?: string }>()
  const router = useRouter()

  const initialIdentifier = (params.identifier || params.email || '').trim()

  const [step, setStep] = useState<'request' | 'verify'>(initialIdentifier ? 'request' : 'request')
  const [identifier, setIdentifier] = useState(initialIdentifier)
  const [targetEmail, setTargetEmail] = useState(initialIdentifier.includes('@') ? initialIdentifier : '')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 1 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  // If initialIdentifier has '@' and params.email was explicitly provided from settings, start at verify step
  useEffect(() => {
    if (params.email && params.email.includes('@')) {
      setTargetEmail(params.email.trim())
      setStep('verify')
    }
  }, [params.email])

  async function handleSendCode() {
    const rawInput = identifier.trim()
    if (!rawInput) {
      Alert.alert('Bilgi Gerekli', 'Lütfen e-posta adresinizi veya kullanıcı adınızı girin.')
      return
    }

    setLoading(true)
    try {
      let resolvedEmail = rawInput

      // Eğer kullanıcı adı girildiyse (içinde @ yoksa), e-postasını profilden bul
      if (!rawInput.includes('@')) {
        const cleanUsername = rawInput.replace(/^@/, '')
        const { data: foundProfile, error: profileErr } = await supabase
          .from('profiles')
          .select('email')
          .ilike('username', cleanUsername)
          .maybeSingle()

        if (profileErr || !foundProfile?.email) {
          setLoading(false)
          return Alert.alert(
            'Kullanıcı Bulunamadı',
            `"${rawInput}" kullanıcı adına ait kayıtlı bir hesap bulunamadı. Lütfen e-posta adresinizi yazın.`
          )
        }
        resolvedEmail = foundProfile.email
      }

      setTargetEmail(resolvedEmail)

      const { error } = await supabase.auth.resetPasswordForEmail(resolvedEmail)
      if (error) {
        Alert.alert('Kod Gönderilemedi', getCleanErrorMessage(error))
      } else {
        setResendCooldown(60)
        setStep('verify')
        Alert.alert(
          'Kod Gönderildi',
          `${resolvedEmail} adresinize 6 haneli şifre sıfırlama kodu gönderildi. Lütfen gelen kutunuzu (ve Spam klasörünü) kontrol edin.`
        )
      }
    } catch (e: any) {
      Alert.alert('Hata', getCleanErrorMessage(e))
    }
    setLoading(false)
  }

  async function handleResendCode() {
    if (resendCooldown > 0) return
    if (!targetEmail) {
      setStep('request')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail)
      if (error) {
        Alert.alert('Kod Gönderilemedi', getCleanErrorMessage(error))
      } else {
        setResendCooldown(60)
        Alert.alert('Kod Tekrar Gönderildi', `${targetEmail} adresine yeni bir kod iletildi.`)
      }
    } catch (e: any) {
      Alert.alert('Hata', getCleanErrorMessage(e))
    }
    setLoading(false)
  }

  async function handleResetPassword() {
    const cleanCode = code.trim()
    if (!targetEmail) {
      Alert.alert('Hata', 'E-posta adresi bulunamadı. Lütfen işlemi baştan başlatın.')
      setStep('request')
      return
    }

    if (!cleanCode || cleanCode.length < 6) {
      Alert.alert('Eksik Kod', 'Lütfen e-postanıza gelen 6 haneli doğrulama kodunu girin.')
      return
    }

    if (!newPassword.trim() || newPassword.length < 6) {
      Alert.alert('Geçersiz Şifre', 'Yeni şifreniz en az 6 karakter olmalıdır.')
      return
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Şifreler Eşleşmiyor', 'Girdiğiniz yeni şifreler birbiriyle aynı değil.')
      return
    }

    setLoading(true)
    try {
      // 1. Recovery OTP Kodunu Doğrula
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        email: targetEmail,
        token: cleanCode,
        type: 'recovery',
      })

      if (verifyError) {
        setLoading(false)
        return Alert.alert(
          'Kod Geçersiz veya Süresi Dolmuş',
          'Girdiğiniz doğrulama kodu hatalı. Lütfen e-postanızı kontrol edin veya yeni bir kod talep edin.'
        )
      }

      // 2. Yeni Şifreyi Kaydet
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateError) {
        setLoading(false)
        return Alert.alert('Şifre Güncellenemedi', getCleanErrorMessage(updateError))
      }

      // 3. Başarıyla oturum aç veya login ekranına yönlendir
      await supabase.auth.signOut()
      Alert.alert(
        'Şifreniz Değiştirildi',
        'Yeni şifreniz başarıyla kaydedildi. Şimdi yeni şifrenizle giriş yapabilirsiniz.',
        [
          {
            text: 'Giriş Yap',
            onPress: () => router.replace('/(auth)/login'),
          },
        ]
      )
    } catch (e: any) {
      Alert.alert('Hata', getCleanErrorMessage(e))
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
    marginBottom: 14,
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
          <Text style={{ fontSize: 36, fontWeight: '700', color: '#f0f0f0', textAlign: 'center', marginBottom: 6 }}>
            dythin<Text style={{ color: '#7F77DD' }}>.</Text>
          </Text>

          <Text style={{ fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 8 }}>
            Şifre Sıfırlama
          </Text>

          {step === 'request' ? (
            /* ADIM 1: E-POSTA VEYA KULLANICI ADI GİRİŞİ */
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 13, color: '#aaa', textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
                Hesabınıza ait e-posta adresinizi veya kullanıcı adınızı girin. Size 6 haneli bir sıfırlama kodu göndereceğiz.
              </Text>

              <TextInput
                style={inputStyle}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="E-posta veya Kullanıcı Adı"
                placeholderTextColor="#555"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSendCode}
                editable={!loading}
              />

              <TouchableOpacity
                style={{
                  backgroundColor: '#7F77DD',
                  borderRadius: 14,
                  padding: 16,
                  alignItems: 'center',
                  marginTop: 6,
                  marginBottom: 16,
                }}
                onPress={handleSendCode}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
                    Sıfırlama Kodu Gönder
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={{ alignItems: 'center', padding: 12 }}
                onPress={() => router.replace('/(auth)/login')}
                disabled={loading}
              >
                <Text style={{ color: '#7F77DD', fontSize: 14 }}>← Giriş Ekranına Dön</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ADIM 2: KOD VE YENİ ŞİFRE GİRİŞİ */
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 13, color: '#aaa', textAlign: 'center', marginBottom: 20, lineHeight: 20 }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{targetEmail}</Text> adresine gönderilen 6 haneli doğrulama kodunu ve yeni şifrenizi girin.
              </Text>

              <TextInput
                style={[
                  inputStyle,
                  { textAlign: 'center', letterSpacing: 6, fontSize: 22, fontWeight: '700' },
                ]}
                value={code}
                onChangeText={(val) => setCode(val.replace(/\D/g, '').slice(0, 8))}
                placeholder="000000"
                placeholderTextColor="#444"
                keyboardType="number-pad"
                maxLength={8}
                returnKeyType="next"
                editable={!loading}
              />

              <TextInput
                style={inputStyle}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Yeni Şifre (En az 6 karakter)"
                placeholderTextColor="#555"
                secureTextEntry
                returnKeyType="next"
                editable={!loading}
              />

              <TextInput
                style={inputStyle}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Yeni Şifre (Tekrar)"
                placeholderTextColor="#555"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleResetPassword}
                editable={!loading}
              />

              <TouchableOpacity
                style={{
                  backgroundColor: '#7F77DD',
                  borderRadius: 14,
                  padding: 16,
                  alignItems: 'center',
                  marginTop: 6,
                  marginBottom: 16,
                }}
                onPress={handleResetPassword}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
                    Şifreyi Değiştir ve Kaydet
                  </Text>
                )}
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={handleResendCode}
                  disabled={loading || resendCooldown > 0}
                  style={{ padding: 8 }}
                >
                  <Text
                    style={{
                      color: resendCooldown > 0 ? '#666' : '#7F77DD',
                      fontSize: 13,
                      fontWeight: '500',
                    }}
                  >
                    {resendCooldown > 0
                      ? `Kodu Tekrar Gönder (${resendCooldown}s)`
                      : 'Kodu Tekrar Gönder'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={{ alignItems: 'center', padding: 8 }}
                onPress={() => setStep('request')}
                disabled={loading}
              >
                <Text style={{ color: '#888', fontSize: 13 }}>← Farklı E-posta veya Kullanıcı Adı Dene</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ alignItems: 'center', padding: 12, marginTop: 4 }}
                onPress={() => router.replace('/(auth)/login')}
                disabled={loading}
              >
                <Text style={{ color: '#7F77DD', fontSize: 14 }}>Giriş Ekranına Dön</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
