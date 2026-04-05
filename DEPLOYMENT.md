# Deployment Guide: Shared Hosting (cPanel)

Panduan ini menjelaskan cara mengonfigurasi bot untuk dideploy ke JagoanHosting atau layanan cPanel lainnya menggunakan **Node.js Selector**.

## 1. Persiapan di cPanel
1. Masuk ke cPanel -> **Setup Node.js App**.
2. Klik **Create Application**.
3. Atur parameter berikut:
   - **Node.js version**: Pilih versi terbaru (v20+ disarankan).
   - **Application mode**: `Production`.
   - **Application root**: `botanon` (sesuai folder yang Anda inginkan).
   - **Application URL**: `boxanon.my.id/botanon`.
   - **Application startup file**: `index.js`.
4. Klik **Create**.

## 2. Unggah File
1. Kompres semua file project (kecuali `node_modules` dan `.git`) menjadi `.zip`.
2. Unggah ke File Manager di folder `/botanon`.
3. Ekstrak file tersebut.

## 3. Konfigurasi Environment (.env)
Edit file `.env` di dalam folder project Anda dan pastikan isinya seperti ini:

```env
# Bot Configuration
BOT_TOKEN=8660677578:AAGR13U9zH7Ja6ChkXsIupGN1__OqesgVfo

# Database (MySQL Production)
DATABASE_URL=mysql://boxanonm_db:8dsmGE9nx6gvwbG@lucky.jagoanhosting.id:3306/boxanonm_botanon

# Webhook Configuration (PENTING)
USE_WEBHOOK=true
WEBHOOK_DOMAIN=boxanon.my.id
WEBHOOK_PATH=/botanon/telegraf/secret-xyz-123
```

> [!TIP]
> Ganti `secret-xyz-123` dengan string acak buatan Anda sendiri untuk keamanan.

## 4. Instalasi Dependensi
1. Kembali ke **Setup Node.js App**.
2. Di bagian "Configuration files", pastikan `package.json` terdeteksi.
3. Klik tombol **Run NPM Install**.
4. Setelah selesai, klik **Restart Application**.

## 5. Verifikasi
- Buka browser dan akses: `https://boxanon.my.id/botanon/health`.
- Jika muncul respon `{"status":"ok","mode":"webhook"}`, berarti bot sudah berjalan dengan benar!
- Coba kirim pesan ke bot di Telegram.

---
**Catatan Keamanan**: 
Pastikan file `.env` tidak bisa diakses publik (seharusnya aman jika ditaruh di folder aplikasi Node.js Selector).
