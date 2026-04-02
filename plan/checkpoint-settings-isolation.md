# Settings Isolation & Chat Barrier

## Feature summary (high-level, 5–10 lines)
- Goal: Menjamin kerahasiaan input pengaturan agar tidak bocor ke lawan bicara dalam chat.
- User-facing behavior: Pengguna yang sedang chat tidak bisa masuk ke menu pengaturan tanpa konfirmasi, dan input pengaturan dijamin tidak terkirim sebagai pesan chat.
- Scope (in): `src/bot.js` (logic gate di text handler, proteksi perintah /settings).
- Risks: Memastikan user tidak terjebak dalam status pengaturan (stuck) jika mereka berubah pikiran.

## Checklist (TDD-first, actionable)

- [x] Implementasi Gerbang Logika Ketat (Strict Gate)
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Pindahkan pengecekan `ctx.session.setting` ke baris paling atas di `bot.on('text')` dan tambahkan blok `else` yang sangat jelas untuk logika chat.
  - VERIFY: Saat status setting aktif, pesan chat manual tidak akan terkirim ke partner.

- [x] Proteksi Perintah /settings saat Chat Aktif
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Di dalam perintah `/settings`, cek apakah user memiliki `activeChat`. Jika ya, kirim pesan peringatan bahwa mereka harus mengakhiri chat (`/stop` atau `/next`) terlebih dahulu untuk keamanan.
  - VERIFY: Klik `/settings` saat sedang mengobrol, pastikan menu tidak terbuka dan muncul peringatan keamanan.

- [x] Tambahkan Tombol "Batal" pada Pengaturan
  - Files: `src/bot.js`, `src/locales.js`
  - TEST: N/A
  - IMPLEMENT: Tambahkan opsi tombol "Cancel" saat meminta input umur di pengaturan.
  - VERIFY: Klik batal, pastikan status `ctx.session.setting` menjadi null.

- [x] Notify Completion via Telegram
  - Files: `src/bot.js`
  - TEST: N/A
  - IMPLEMENT: Kirim notifikasi final melalui DevLog.
  - VERIFY: N/A

## Progress log (append-only)
- 2026-03-28T18:50:00 - Memulai isolasi menu pengaturan dari alur obrolan.
- 2026-03-28T19:05:00 - Proteksi aktif chat pada /settings dan Logic Gate pada handler teks berhasil diterapkan.
- 2026-03-28T19:10:00 - Tombol Batal dan lokalisasi pendukung ditambahkan di semua bahasa.
