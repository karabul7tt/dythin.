export function getCleanErrorMessage(error: any, defaultMsg = 'İşlem gerçekleştirilemedi. Lütfen tekrar deneyin.'): string {
  if (!error) return defaultMsg
  const rawMsg = typeof error === 'string' ? error : error.message || ''

  if (rawMsg.includes('Invalid login credentials')) {
    return 'E-posta adresi veya şifre hatalı.'
  }
  if (rawMsg.includes('User already registered') || rawMsg.includes('already exists')) {
    return 'Bu e-posta adresiyle kayıtlı bir hesap zaten var.'
  }
  if (rawMsg.includes('Password should be')) {
    return 'Şifreniz en az 6 karakter olmalıdır.'
  }
  if (rawMsg.includes('Email not confirmed')) {
    return 'E-posta adresiniz doğrulanmamış. Lütfen e-postanıza gelen kodu girin.'
  }
  if (rawMsg.includes('rate limit') || rawMsg.includes('Too many requests') || rawMsg.includes('over_email_send_rate_limit')) {
    return 'Çok fazla istek gönderildi. Lütfen biraz bekleyip tekrar deneyin.'
  }
  if (rawMsg.includes('Network request failed') || rawMsg.includes('FetchError')) {
    return 'İnternet bağlantınızı kontrol edin.'
  }

  if (/PGRST|42703|column|relation|syntax|schema|foreign key|constraint|JWT|PostgREST/i.test(rawMsg)) {
    return 'Sunucu ile iletişim kurulurken bir hata oluştu. Lütfen tekrar deneyin.'
  }

  if (rawMsg.length > 80) {
    return defaultMsg
  }

  return rawMsg || defaultMsg
}
