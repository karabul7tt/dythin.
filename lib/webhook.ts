export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!payload || !signature || !secret || typeof crypto === 'undefined' || !crypto.subtle) {
    return false
  }

  try {
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
  } catch {
    return false
  }
}
