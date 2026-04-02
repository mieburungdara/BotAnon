# Perbaikan Stabilitas & Atomisitas Matching (Opsi A)

## Feature summary (high-level, 5–10 lines)
- Goal: Menghilangkan *race condition* saat dua pengguna mencari pasangan di waktu yang bersamaan.
- User-facing behavior: Pengguna akan mendapatkan pasangan secara konsisten tanpa risiko "bertabrakan" atau gagal terhubung karena partner sudah diambil pengguna lain.
- Scope (in): `src/database.js` (penambahan helper transaksi), `src/bot.js` (refaktor logika matching).
- Scope (out): Migrasi ke PostgreSQL (ditunda hingga aplikasi sempurna).
- Assumptions: Menggunakan SQLite (`better-sqlite3`) yang mendukung transaksi sinkron.
- Risks / edge cases: Penguncian database (*database locking*) jika transaksi terlalu lama, namun minimal karena operasi bersifat cepat.

## Checklist (TDD-first, actionable)

- [x] Tambahkan helper `transaction` di adapter SQLite
  - Files: `src/database.js`
  - TEST: N/A (Manual check of sqlite instance for transaction method)
  - IMPLEMENT: Tambahkan metode `transaction(fn)` pada objek return `createSqliteAdapter` yang membungkus `sqlite.transaction()`.
  - VERIFY: N/A

- [x] Refaktor `findMatchForUser` agar atomik
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Gunakan `db.transaction` untuk membungkus proses `SELECT waiting user` -> `UPDATE status` -> `INSERT chat`.
  - VERIFY: Pastikan tidak ada partner yang sama yang diambil oleh dua user berbeda.

- [x] Sinkronisasi kueri di `initDB`
  - Files: `src/database.js`
  - TEST: N/A
  - IMPLEMENT: Pastikan semua pemanggilan `db.query` di `initDB` bersifat konsisten (menggunakan await jika diperlukan untuk kompatibilitas masa depan).
  - VERIFY: Jalankan bot dan pastikan tabel terbuat tanpa error.

- [x] Notify Completion via Telegram
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Run the notification via DevLog.
  - VERIFY: N/A

## Progress log (append-only)
- 2026-03-28T15:10:00 - Memulai pembuatan rencana perbaikan stabilitas Opsi A.
- 2026-03-28T15:15:00 - Berhasil menambahkan helper `transaction` di `src/database.js` untuk SQLite dan PostgreSQL.
- 2026-03-28T15:20:00 - Refaktor `findMatchForUser` di `src/bot.js` menggunakan transaksi untuk atomisitas.
- 2026-03-28T15:22:00 - Sinkronisasi kueri di `initDB` agar kompatibel dengan async/await di semua mode DB.
- 2026-03-28T15:25:00 - Tugas selesai, stabilitas matching ditingkatkan.
