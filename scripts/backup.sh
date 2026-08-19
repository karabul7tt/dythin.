#!/bin/bash

# ============================================================
# DYTHIN. — Otomatik Proje & Şema Yedekleme Scripti
# ============================================================

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo "📦 Otomatik yedekleme başlatılıyor: $TIMESTAMP"

# 1. Yedek klasörünü oluştur
mkdir -p "$BACKUP_DIR"

# 2. Supabase SQL Şemasını kopyala ve zaman damgalı sakla
cp ./supabase-setup.sql "$BACKUP_DIR/supabase_schema_$TIMESTAMP.sql"

# 3. Önemli yapılandırma dosyalarını arşivle (env dosyası hariç)
tar --exclude='node_modules' --exclude='.expo' --exclude='.env' -czf "$BACKUP_DIR/dythin_backup_$TIMESTAMP.tar.gz" ./app ./components ./lib ./context ./supabase-setup.sql ./package.json ./app.json

echo "✅ Otomatik yedekleme tamamlandı!"
echo "📁 Arşiv kaydedildi: $BACKUP_DIR/dythin_backup_$TIMESTAMP.tar.gz"
