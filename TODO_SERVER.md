# TODO SERVER

## Implementasi Inline Keyboard Edit Message (Status: Selesai)
- [x] Update alur /start (profileSetup) untuk menggunakan ctx.editMessageText
- [x] Simpan message ID saat meminta input text (contoh: umur) agar dapat diedit atau dihapus
- [x] Update alur /settings agar callback query mengganti pesan utama, bukan membuat pesan baru
- [x] Hapus/Edit tombol inline keyboard menjadi pesan "Updated successfully" ketika pengaturan pada /settings telah selesai

## Menambahkan Bot Commands Menu (Status: Selesai)
- [x] Mendaftarkan seluruh command yang tersedia ke dalam menu bot Telegram menggunakan `bot.telegram.setMyCommands()`
- [x] Memberikan deskripsi singkat opsi A untuk setiap command agar pengguna paham fungsinya

## Menambahkan Sistem Multibahasa / i18n (Status: Selesai)
- [x] Membuat sistem kamus terjemahan (dictionary) untuk mengelola teks berbagai bahasa
- [x] Membuat helper `t(key, language)` untuk mengambil teks yang tepat
- [x] Menerapkan helper terjemahan ke seluruh respon teks bot di `bot.js`

## Menambahkan Bahasa Arab (Status: Selesai)
- [x] Menambahkan dictionary Arabic pada file `locales.js`
- [x] Menambahkan opsi tombol bahasa Arab di `/start` dan `/settings` pada `bot.js`

## Sistem Pelaporan Pengguna / Report (Status: Selesai)
- [x] Menambahkan tabel 'reports' ke dalam sistem database (SQLite/PostgreSQL)
- [x] Menambahkan daftar alasan & respon bot di `locales.js` (5 bahasa)
- [x] Menambahkan alur Scene untuk pemilihan alasan laporan & penambahan detail (opsional)
- [x] Menyimpan laporan ke database secara anonim & mengirim pesan konfirmasi
- [x] Memberikan opsi aksi setelah pelaporan (misal: otomatis memutus chat saat di-report - OPSI A)

## Perbaikan & Modifikasi Report Asinkron (Status: Selesai)
- [x] Menambahkan kolom `report_count` beserta jumlah kategori (Spam, Harassment dll) pada tabel `users`
- [x] Membuat query helper `getLastPartnerByUserId` untuk mencari 'Lawan chat terakhir' di histori obrolan
- [x] Mengubah command `/report` agar bisa melapor meski chat sudah usai
- [x] Memindahkan fungsi `endChat()` agar aktif HANYA setelah korban memilih tombol alasan di inline keyboard
- [x] Menerapkan increment `report_count` (+1) kepada pelaku setiap direport dan sistem Auto-Warn (Opsi B)

## Menambahkan Fitur Reply ke /report (Status: Selesai)
- [x] Memeriksa keberadaan `ctx.message.reply_to_message` saat command /report dipanggil
- [x] Menyisipkan isi teks pesan dari partner yang direply ke dalam variabel bukti (termasuk file_id untuk foto/video)
- [x] Meng-gabungkan (append) bukti tersebut ke dalam kolom `details` pada database
- [x] Memperbarui string menu description agar memuat informasi terkait reply dan menambahkan pesan edukasi pada fitur Match Partner

## Menambah Sistem Reputasi Positif & Negatif (Status: Selesai)
- [x] Menambahkan kolom penilaian (rating) di skema database agar chat antar A & B dapat dicatat reputasinya
- [x] Memastikan rating (👍/👎) tidak bisa terduplikasi apabila pengguna A bertemu secara anonim dengan pengguna B untuk kedua kalinya
- [x] Menyisipkan tombol [👍 Beri nilai positif] & [👎 Beri nilai negatif] kepada masing-masing pengguna di setiap akhir percakapan (via inline mode chat ended)
- [x] Menghasilkan nilai total pada admin view/database (tanpa bisa dilihat pengguna lain)

## Integrasi Fitur Zodiak & Kecocokan Pasangan (Status: Selesai)
- [x] Menambahkan kolom `zodiac` pada tabel database `users`
- [x] Menambahkan pertanyaan identitas Zodiak ke dalam pendaftaran awal (`/start`) melalui *Inline Keyboard*
- [x] Menerapkan kalkulator Kecocokan Zodiak (Zodiac Compatibility) antar dua pengguna (dalam %)
- [x] Mengubah pengantar koneksi / match agar menampilkan Zodiak serta hasil persentase kecocokannya
- [x] Menambahkan fitur ganti Zodiak di menu pengaturan `/settings`

## Penambahan Dukungan Berbagi Kiriman Media (File/Foto/Video) (Status: Selesai)
- [x] Mengubah `bot.on('text')` agar bertugas mendeteksi seluruh event berkirim format `message`
- [x] Menambahkan logika menangkap dan meneruskan file_id tipe foto, video, voice, doc, audio ke pasangan
- [x] Menyimpan file_id tersebut ke tabel database `messages` bersama dengan pesan teksnya

## Sistem Role Pengguna: Admin, VIP, User (Status: Selesai)
- [x] Menambahkan kolom `role` (default 'user') pada tabel `users` di SQLite dan PostgreSQL
- [x] Memodifikasi `findMatchForUser` agar info partner berbeda per role:
  - Admin: melihat umur + gender
  - VIP: melihat gender + zodiak
  - User biasa: hanya melihat zodiak + kecocokan
- [ ] (Masa depan) Fitur subscribe harian/mingguan/bulanan untuk VIP

## Implementasi Structured Logging (Pino) (Status: Selesai)
- [x] Instalasi `pino` dan `pino-pretty` sebagai dependency utama
- [x] Membuat centralized utility `src/utils/logger.js` dengan dukungan `pino-pretty` untuk development
- [x] Migrasi seluruh `console.log` dan `console.error` di `src/database.js`
- [x] Migrasi seluruh `console.error` di `src/bot.js` ke `logger.error` dengan Error objects
- [x] Integrasi metadata terstruktur pada `bot.catch` (updateType, userId, chatId)
- [x] Implementasi logging pada alur graceful shutdown
