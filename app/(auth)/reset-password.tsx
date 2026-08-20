import { useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'

export default function ResetPassword() {
  const params = useLocalSearchParams<{ email?: string }>()
  const router = useRouter()
  const email = typeof params.email === 'string' ? params.email : ''
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verified, setVerified] = useState(false)
  const [loading, setLoading] = useState(false)

  async function verifyCode() {
    const cleanCode = code.trim()
    if (!email) return Alert.alert('Hata', 'E-posta adresi bulunamadı. Lütfen tekrar dene.')
    if (!/^\d{6,8}$/.test(cleanCode)) return Alert.alert('Kodu kontrol et', 'E-postadaki doğrulama kodunu gir.')

    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({ email, token: cleanCode, type: 'recovery' })
    setLoading(false)

    if (error) return Alert.alert('Kod geçersiz', error.message)
    setVerified(true)
  }

  async function savePassword() {
    if (newPassword.length < 6) return Alert.alert('Şifre kısa', 'Şifren en az 6 karakter olmalı.')
    if (newPassword !== confirmPassword) return Alert.alert('Şifreler aynı değil', 'Yeni şifreleri aynı yaz.')

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)

    if (error) return Alert.alert('Şifre değiştirilemedi', error.message)
    await supabase.auth.signOut()
    Alert.alert('Şifren değiştirildi', 'Yeni şifrenle giriş yapabilirsin.')
    router.replace('/(auth)/login')
  }

  const inputStyle = { backgroundColor: '#161622', borderWidth: 0.5, borderColor: '#2a2a3a', borderRadius: 14, padding: 16, fontSize: 15, color: '#fff', marginBottom: 12 }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0e0e1a' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', padding: 28 }}>
        <Text style={{ fontSize: 32, fontWeight: '700', color: '#f0f0f0', textAlign: 'center', marginBottom: 8 }}>Şifre sıfırla</Text>
        <Text style={{ fontSize: 14, color: '#aaa', textAlign: 'center', marginBottom: 30 }}>
          {verified ? 'Yeni şifreni belirle.' : `${email} adresine gönderilen doğrulama kodunu gir.`}
        </Text>

        {!verified ? (
          <>
            <TextInput
              style={[inputStyle, { textAlign: 'center', letterSpacing: 4, fontSize: 20 }]}
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Doğrulama Kodu"
              placeholderTextColor="#555"
              keyboardType="number-pad"
              maxLength={8}
              editable={!loading}
            />
            <TouchableOpacity style={{ backgroundColor: '#7F77DD', borderRadius: 14, padding: 16, alignItems: 'center' }} onPress={verifyCode} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Kodu doğrula</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput style={inputStyle} value={newPassword} onChangeText={setNewPassword} placeholder="Yeni şifre" placeholderTextColor="#555" secureTextEntry editable={!loading} />
            <TextInput style={inputStyle} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Yeni şifre (tekrar)" placeholderTextColor="#555" secureTextEntry editable={!loading} />
            <TouchableOpacity style={{ backgroundColor: '#7F77DD', borderRadius: 14, padding: 16, alignItems: 'center' }} onPress={savePassword} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Şifreyi değiştir</Text>}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={() => router.replace('/(auth)/login')} disabled={loading}>
          <Text style={{ color: '#7F77DD', fontSize: 14 }}>Giriş ekranına dön</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
