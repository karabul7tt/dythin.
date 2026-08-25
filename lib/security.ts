/**
 * DYTHIN. — XSS (Cross-Site Scripting) Kaçırma ve Metin Temizleme Modülü
 * Kullanıcı girdilerindeki zararlı HTML ve JavaScript etiketlerini etkisiz hale getirir.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
}

/**
 * Metin içerisindeki HTML özel karakterlerini kaçırır (HTML Escape)
 */
export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return ''
  return str.replace(/[&<>"'/]/g, (match) => HTML_ESCAPES[match] || match)
}

/**
 * Kullanıcı tarafından girilen metinleri XSS ve komut enjeksiyonuna karşı temizler
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return ''
  
  // 1. Boşlukları kırp
  let sanitized = input.trim()
  
  // 2. Potansiyel script etiketlerini ve tehlikeli nitelikleri sil
  sanitized = sanitized
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')

  return sanitized
}

/**
 * Instagram tarzı standart kullanıcı adı doğrulama ve temizleme:
 * - Yalnızca küçük harf (a-z), rakam (0-9), nokta (.) ve alt çizgi (_)
 * - Minimum 3, maksimum 30 karakter
 * - Nokta veya alt çizgi ile başlayamaz / bitemez
 * - Ardışık nokta (..) veya ardışık alt çizgi (__) içeremez
 * - Boşluk, emoji veya özel şekilli semboller yasak
 */
export function validateInstagramUsername(username: string): { valid: boolean; cleanUsername: string; error?: string } {
  if (!username || typeof username !== 'string') {
    return { valid: false, cleanUsername: '', error: 'Kullanıcı adı zorunludur.' }
  }

  const clean = username.trim().toLowerCase()

  if (clean.length < 3) {
    return { valid: false, cleanUsername: clean, error: 'Kullanıcı adı en az 3 karakter olmalıdır.' }
  }

  if (clean.length > 30) {
    return { valid: false, cleanUsername: clean, error: 'Kullanıcı adı en fazla 30 karakter olabilir.' }
  }

  if (!/^[a-z0-9._]+$/.test(clean)) {
    return {
      valid: false,
      cleanUsername: clean,
      error: 'Kullanıcı adında yalnızca küçük harf, rakam, nokta (.) ve alt çizgi (_) kullanılabilir. Özel şekiller veya semboller kullanılamaz.',
    }
  }

  if (/^[._]/.test(clean) || /[._]$/.test(clean)) {
    return {
      valid: false,
      cleanUsername: clean,
      error: 'Kullanıcı adı nokta (.) veya alt çizgi (_) ile başlayamaz ve bitemez.',
    }
  }

  if (/\.\.|\_\_|\._|_\./.test(clean)) {
    return {
      valid: false,
      cleanUsername: clean,
      error: 'Kullanıcı adı üst üste birden fazla nokta veya alt çizgi içeremez.',
    }
  }

  return { valid: true, cleanUsername: clean }
}
