# Dokumentasi Perbaikan Sistem Absensi & Payroll

Folder `Docs` kini disusun rapi dengan prefix numerik. Setiap dokumen mencerminkan status audit dan perbaikan kode yang sudah diterapkan, dan membantu melacak mana yang murni dokumentasi historis versus hasil perombakan akhir.

## Struktur dan Status

1. `01_Analisis_Algoritma_Absensi_Mei.md`
   - Isi: analisis masalah utama di data Mei, pola anomali mesin fingerprint, dan perbandingan antara output sistem lama dan hasil akuntan.
   - Status: dokumentasi analisis. Berguna untuk referensi debug dan validasi bahwa logika sekarang sudah mengatasi penyebab root-cause.

2. `02_Dokumentasi_Perbaikan_v2.md`
   - Isi: ringkasan Fix #1–#5, termasuk cross-midnight, duplikat status, pembulatan jam masuk/keluar, dan aturan lembur singkat.
   - Status: dokumentasi perbaikan yang sudah diimplementasikan di `Kode.gs` sebagai bagian dari revisi stabil.

3. `03_Dokumentasi_Perbaikan_Sistem_Payroll_v3.md`
   - Isi: Fix #6, audit akhir terhadap data Mei, dan koreksi besar untuk tag `Lembur Bebas` serta pengembalian logika hari kerja normal.
   - Status: dokumentasi perombakan final. Menunjukkan bahwa kode saat ini sudah bertransisi ke versi `v3` dengan perubahan arsitektur penting.

## Keterangan Khusus

- `Kode.gs` dan `Index.html` saat ini sudah mengalami perombakan menyeluruh untuk mendukung workflow modern dan aturan payroll terbaru.
- `Docs/03_Dokumentasi_Perbaikan_Sistem_Payroll_v3.md` adalah referensi utama untuk perubahan terbesar dan harus dijadikan acuan bila ada revisi lanjutan.
- `Docs/02_Dokumentasi_Perbaikan_v2.md` tetap penting karena berisi detail fix teknis yang mendasari logika saat ini.

## Rekomendasi Penggunaan

- Buka `Docs/README.md` dulu bila ingin memahami konteks folder dokumentasi.
- Cek `03_Dokumentasi_Perbaikan_Sistem_Payroll_v3.md` untuk perubahan logika `Lembur Bebas` dan aturan `JK` vs `Lembur` yang sudah dirombak.
- Cek `02_Dokumentasi_Perbaikan_v2.md` untuk referensi implementasi fix operasional jika perlu audit session-by-session.
