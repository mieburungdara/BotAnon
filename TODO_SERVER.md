# TODO SERVER BotAnon (Backend)

## [ ] Optimasi Database
- [ ] Auto-Archiving: Pindahkan pesan berumur > 30 hari ke Cold Storage secara terjadwal.
- [ ] Implementasi Redis Cache untuk session (untuk latency lebih rendah di trafik tinggi).
- [ ] Migrasi PostgreSQL murni secara bertahap (skema sinkronisasi).

## [ ] Fitur Baru (API/Service)
- [ ] Endpoint untuk Admin Dashboard (Melihat statistik aktif: User, Chat, Queue).
- [ ] Integrasi Sentry/LogDNA untuk monitoring error produksi secara real-time.
- [ ] Service untuk Media Filtering (API Deteksi AI NSFW).

## [ ] Task Teknis
- [ ] Migrasi ke TypeScript murni (untuk memperbaiki 60+ linting errors).
- [ ] Implementasi Unit Testing (Jest) untuk Matchmaking Logic.
- [ ] Graceful Shutdown untuk me-reset state user di queue saat server mati.
