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
