# Optimasi Sesi & Performa Database (Opsi G & H)

## Feature summary (high-level, 5–10 lines)
- Goal: Menghilangkan kebocoran memori (memory leak) dengan memindahkan sesi ke database dan mencegah error "database is locked" pada SQLite.
- Scope (in): `src/database.js` (tabel sesi & busy timeout), `src/bot.js` (persistent session middleware).
- Risks: Migrasi sesi harus dilakukan dengan hati-hati agar tidak merusak data sesi pengguna yang sedang aktif saat update.
- Assumptions: Menggunakan tabel `sessions` di SQLite untuk menyimpan data JSON sesi.

## Checklist (TDD-first, actionable)

- [x] Optimasi SQLite Busy Timeout
  - Files: `src/database.js`
  - TEST: N/A
  - IMPLEMENT: Tambahkan `pragma('busy_timeout = 5000')` pada adapter SQLite.
  - VERIFY: Pastikan bot tidak mengalami error locking saat diuji dengan kueri simultan.

- [x] Buat Tabel Sesi & Persistent Session Middleware
  - Files: `src/database.js`, `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Tambahkan tabel `sessions` di `initDB`. Buat middleware sesi kustom di `bot.js` yang membaca/menulis ke database.
  - VERIFY: Restart bot dan pastikan data pendaftaran profil (session) tidak hilang.

- [x] Bersihkan Status Sesi Otomatis
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Reset `ctx.session.setting` saat memicu perintah baru (/start, /next, dsb).
  - VERIFY: Pastikan input chat tidak salah tangkap jika user membatalkan pengaturan.

- [x] Notify Completion via Telegram
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Kirim notifikasi final.
  - VERIFY: N/A

## Progress log (append-only)
- 2026-03-28T16:15:00 - Memulai optimasi sesi persistent dan busy timeout database.
- 2026-03-28T16:30:00 - Implementasi persistent session middleware dan busy timeout selesai.
- 2026-03-28T16:35:00 - Logic reset session state ditambahkan ke seluruh command handler utama.
