# Architectural Integrity & Concurrency (Opsi X, Y, Z)

## Feature summary (high-level, 5–10 lines)
- Goal: Menstandarisasi sistem transaksi agar kompatibel dengan PostgreSQL, melindungi integritas obrolan saat perintah /start dijalankan, dan mengamankan konkurensi sesi.
- Scope (in): `src/database.js` (refaktor transaction helper), `src/bot.js` (start command protection & session refinement).
- Risks: Refaktor transaksi harus dilakukan dengan sangat teliti karena mempengaruhi seluruh alur matching.
- Assumptions: Menggunakan pola passing `tx` object pada callback transaksi.

## Checklist (TDD-first, actionable)

- [x] Refaktor Transaksi Universal (Opsi X)
  - Files: `src/database.js`, `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Ubah `db.transaction` agar memberikan objek kueri internal ke callback. Perbarui `findMatchForUser` untuk menggunakan kueri dari objek tersebut.
  - VERIFY: Jalankan matching dan pastikan data tetap konsisten di SQLite.

- [x] Proteksi Chat pada Perintah /start (Opsi Y)
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Tambahkan pengecekan `getActiveChatByUserId` di perintah `/start`. Jika ada chat aktif, cegah user masuk ke mode waiting.
  - VERIFY: Ketik `/start` saat sedang mengobrol, pastikan bot memberikan peringatan dan tidak memutus chat secara paksa.

- [x] Optimasi Konkurensi Sesi (Opsi Z)
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Pastikan penyimpanan sesi hanya terjadi jika data benar-benar berubah.
  - VERIFY: Kirim pesan beruntun dan pastikan status sesi tidak rusak.

- [x] Notify Completion via Telegram
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Kirim notifikasi final melalui DevLog.
  - VERIFY: N/A

## Progress log (append-only)
- 2026-03-28T20:00:00 - Memulai refaktor arsitektur transaksi dan proteksi perintah /start.
- 2026-03-28T20:15:00 - Standarisasi sistem transaksi (tx object) selesai untuk SQLite & PG.
- 2026-03-28T20:20:00 - Proteksi obrolan aktif ditambahkan ke perintah /start.
- 2026-03-28T20:25:00 - Optimasi middleware sesi (save only on change) berhasil diterapkan.
- 2026-03-28T20:30:00 - Seluruh checklist arsitektural dan konkurensi terpenuhi.
