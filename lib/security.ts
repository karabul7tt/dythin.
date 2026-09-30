const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
}

export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return ''
  return str.replace(/[&<>"'/]/g, (match) => HTML_ESCAPES[match] || match)
}

export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return ''
  
  let sanitized = input.trim()
  sanitized = sanitized
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')

  return sanitized
}

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
