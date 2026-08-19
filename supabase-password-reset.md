# 6 haneli şifre sıfırlama kodu ayarı

Supabase Dashboard'da **Authentication > Email Templates > Reset Password** bölümünü açın.
Konu satırını `Dythin şifre sıfırlama kodun` yapın ve içerik alanına bunu koyup kaydedin:

```html
<h2>Şifre sıfırlama</h2>
<p>Dythin şifreni sıfırlamak için aşağıdaki 6 haneli kodu uygulamaya gir:</p>
<p style="font-size: 28px; font-weight: bold; letter-spacing: 6px;">{{ .Token }}</p>
<p>Bu kodu kimseyle paylaşma. Şifre sıfırlama isteğini sen yapmadıysan bu e-postayı yok sayabilirsin.</p>
```

Önemli: Eski şablondaki `{{ .ConfirmationURL }}` bağlantısını kaldırın. Bu uygulama bağlantı yerine `{{ .Token }}` ile gelen 6 haneli kodu doğrular.
