# Performance & Data Freshness (Opsi P, Q, R)

## Feature summary (high-level, 5–10 lines)
- Goal: Memperbaiki emulasi `RETURNING` SQLite, mengoptimalkan kecepatan chat dengan menghapus overhead kueri yang tidak perlu, mensinkronisasi identitas Telegram secara otomatis, dan memastikan startup bot yang tangguh.
- Scope (in): `src/database.js` (adapter logic), `src/bot.js` (saveMessage, /start, bot.launch).
- Risks: Perubahan adapter SQLite harus dilakukan dengan sangat hati-hati agar tidak merusak fungsi `updateUserState` atau `updateUserProfile`.
- Assumptions: Sinkronisasi identitas dilakukan setiap kali user menjalankan `/start`.

## Checklist (TDD-first, actionable)

- [x] Optimasi Adapter SQLite & Chat (Opsi P)
  - Files: `src/database.js`, `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Hapus `RETURNING *` pada kueri `saveMessage`. Perbaiki logika `extractTableName` dan pengambilan ID pada adapter SQLite agar lebih cerdas (tidak hanya mengambil parameter terakhir).
  - VERIFY: Kirim pesan chat dan pastikan tetap tersimpan di DB tanpa error, dengan performa lebih cepat.

- [x] Auto-Sync Identitas Telegram (Opsi Q)
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Perbarui logika di perintah `/start` agar melakukan `UPDATE` pada `username`, `first_name`, dan `last_name` setiap kali dipanggil.
  - VERIFY: Ubah nama di Telegram, ketik `/start`, dan pastikan nama baru muncul di database.

- [x] Robust Bot Launch (Opsi R)
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Tambahkan `.catch()` pada `bot.launch()` dengan log error yang informatif.
  - VERIFY: Simulasikan token salah dan pastikan muncul log error yang jelas daripada crash mentah.

- [x] Notify Completion via Telegram
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Kirim notifikasi final melalui DevLog.
  - VERIFY: N/A

## Progress log (append-only)
- 2026-03-28T17:45:00 - Memulai optimasi performa kueri dan sinkronisasi identitas pengguna.
- 2026-03-28T18:00:00 - Adapter SQLite diperbaiki untuk mendukung kueri kompleks.
- 2026-03-28T18:05:00 - Overhead chat dikurangi dengan optimasi saveMessage.
- 2026-03-28T18:10:00 - Fitur auto-sync identitas dan robust launch berhasil diterapkan.
