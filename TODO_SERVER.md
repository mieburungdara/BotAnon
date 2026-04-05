# TODO SERVER BotAnon (Backend)

## [ ] Optimasi Database
- [ ] Auto-Archiving: Pindahkan pesan berumur > 30 hari ke Cold Storage secara terjadwal.
- [ ] Implementasi Redis Cache untuk session (untuk latency lebih rendah di trafik tinggi).
- [x] Migrasi penuh database adapter ke MySQL + InnoDB untuk dukungan Shared Hosting.

## [ ] Fitur Baru (API/Service)
- [ ] Endpoint untuk Admin Dashboard (Melihat statistik aktif: User, Chat, Queue).
- [ ] Integrasi Sentry/LogDNA untuk monitoring error produksi secara real-time.
- [ ] Service untuk Media Filtering (API Deteksi AI NSFW).

## [ ] Task Teknis
- [ ] Migrasi ke TypeScript murni (untuk memperbaiki 60+ linting errors).
- [ ] Implementasi Unit Testing (Jest) untuk Matchmaking Logic.
- [ ] Graceful Shutdown untuk me-reset state user di queue saat server mati.

## [x] new_task(Refactor State Machine & Transactions, backend, todos)
- [x] 1. Update `chatService.js`: Tambahkan parameter `(..., tx = db)` pada fungsi CRUD.
- [x] 2. Buat `stateMachine.js`: Sentralisasi transisi state secara atomik (toWaiting, toChatting, toIdle) dengan transaksi.
- [x] 3. Update `matchmaking.js`: Hapus raw SQL, gunakan `stateMachine.js`.
- [x] 4. Update Handlers (`next.js`, `stop.js`, `find.js`): Gunakan `stateMachine.js`.
- [x] 5. Bersihkan Logika 403 & Self-Healing di `message.js` untuk menggunakan service terpusat.
- [x] 6. Jalankan Full Test Run untuk menjamin stabilitas.
