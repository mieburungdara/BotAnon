# Webhook & Navigation Final Fix (Opsi V & W)

## Feature summary (high-level, 5–10 lines)
- Goal: Memperbaiki URL webhook agar tidak terjadi duplikasi protokol, dan memastikan pengguna bisa membatalkan proses pendaftaran (scene) menggunakan perintah bot.
- User-facing behavior: Pengguna bisa mengetik /stop atau /start untuk keluar dari pendaftaran profil. Webhook bot berfungsi dengan benar di server HTTPS.
- Scope (in): `src/bot.js`.
- Risks: Re-ordering middleware harus dilakukan dengan hati-hati agar tidak merusak session loading.

## Checklist (TDD-first, actionable)

- [x] Webhook URL Sanitization (Opsi V)
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Gunakan regex untuk menghapus `http://` atau `https://` dari `WEBHOOK_DOMAIN`. Tambahkan validasi jika domain kosong saat USE_WEBHOOK=true.
  - VERIFY: Log peluncuran menunjukkan URL yang benar.

- [x] Scene Breakout Logic (Opsi W)
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Pindahkan `stage.middleware()` ke bawah setelah command handlers utama, atau tambahkan pengecekan perintah di dalam scene.
  - VERIFY: Ketik `/stop` saat sedang diminta umur, pastikan bot keluar dari scene dan merespons perintah stop.

- [x] Sinkronisasi Transaksi Database (Refinement)
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Pastikan kueri di dalam transaksi tetap handal.
  - VERIFY: Jalankan test_features.js.

- [x] Notify Completion via Telegram
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Kirim notifikasi final melalui DevLog.
  - VERIFY: N/A

## Progress log (append-only)
- 2026-03-28T19:30:00 - Memulai perbaikan final untuk webhook dan sistem navigasi scene.
- 2026-03-28T19:40:00 - Sanitization Webhook dan Scene Breakout Logic (Command Priority) berhasil diterapkan.
