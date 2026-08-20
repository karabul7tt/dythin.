/**
 * DYTHIN. — Webhook İmza Doğrulama (Webhook Signature Verification) Modülü
 * Sunucuya/Uygulamaya gelen Webhook isteklerinin orijinalliğini ve HMAC-SHA256 imzasını doğrular.
 */

/**
 * Gelen Webhook isteğinin HMAC-SHA256 imzasını ve gizli anahtarını (secret) doğrular.
 * @param payload - İstek gövdesi (string formatında raw body)
 * @param signature - Gelen HTTP başlığındaki imza (Örn: X-Supabase-Signature veya X-Hub-Signature)
 * @param secret - Webhook gizli doğrulama anahtarı
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!payload || !signature || !secret || typeof crypto === 'undefined' || !crypto.subtle) {
    return false
  }

  try {
    // Standard HMAC-SHA256 verification via Web Crypto API
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const messageData = encoder.encode(payload)

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    // Formats like "sha256=abcdef..." or raw hex/base64
    const cleanSignature = signature.includes('=') ? signature.split('=')[1] : signature
    const signatureBytes = new Uint8Array(
      cleanSignature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    )

    const isValid = await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      signatureBytes,
      messageData
    )

    return isValid
  } catch (e) {
    // Signature verification failure or format mismatch
    return false
  }
}
