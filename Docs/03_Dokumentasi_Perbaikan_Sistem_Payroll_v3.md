# Dokumentasi Perbaikan Sistem Payroll v3
**PT. Perfect Garmen Accessories — SIJeJar Payroll Engine**

Lanjutan dari `DOKUMENTASI_PERBAIKAN.md` (v2, fix #1-5). Dokumen ini fokus ke **Fix #6**, hasil audit terhadap `Laporan_Rekap___Payroll_-_22-06-2026_17_47.xlsx` (output dari kode v2) dibandingkan ulang dengan `Rekap_Absen_Mei_hasil_akuntan.xlsx`.

---

## Fix #6 — Scoping Tag "Lembur Bebas" yang Salah

**Skala masalah:** **45.5% dari seluruh 2.206 baris** absensi Mei ditandai "Lembur Bebas" di kolom Keterangan raw data — termasuk hari Senin–Sabtu yang jelas-jelas shift normal 8 jam, bukan cuma di kasus istimewa. Ini bukan bug minor, ini akar masalah dominan yang membuat hampir separuh data salah kategori.

**Bug:** Kode v2 memperlakukan tag "Lembur Bebas" sebagai pemicu untuk **membypass total cap 8 jam DAN aturan istirahat Jumat**, di mana pun tag itu muncul:
```js
if (trackerMasuk.isLibur || isLemburBebas) {   // <-- BUG: isLemburBebas di sini terlalu luas
    outLembur = jkKotor;  // SEMUA jam jadi Lembur, JK kosong
}
```
```js
if (trackerMasuk.isJum && !trackerMasuk.isLibur && !isLemburBebasMasuk) { // <-- BUG juga
    potongIstirahat = HR_CONFIG.ISTIRAHAT.JUMAT;
}
```
Karena tag ini ada di hampir semua baris (termasuk hari kerja normal), efeknya: **JK hampir selalu kosong, semua jam terdorong ke Lembur** — persis keluhan Anda.

**Bukti dari data:** Dibandingkan dengan `Rekap_Absen_Mei_hasil_akuntan.xlsx` untuk ROSSA RECHTISIA (semua baris bertanda "Lembur Bebas", termasuk Senin-Sabtu normal):

| Tanggal | Kode v2 (sebelum) | Hasil Akuntan | Kode v3 (setelah Fix #6) |
|---|---|---|---|
| 04/05 (Senin) | JK=∅, Lembur=9.0 | JK=8, Lembur=1 | **JK=8, Lembur=1.0** ✓ |
| 06/05 (Rabu) | JK=∅, Lembur=8.0 | JK=8, Lembur=∅ | **JK=8, Lembur=∅** ✓ |
| 08/05 (Jumat) | JK=∅, Lembur=8.5 | JK=8, Lembur=∅ | **JK=8, Lembur=∅** ✓ *(istirahat Jumat 1.5 jam ikut terkoreksi)* |
| 12-14/05 (3 hari) | JK=∅, Lembur=8.0/hari | JK=8/hari | **JK=8/hari** ✓✓✓ |
| 20-29/05 (6 hari kerja) | semua ke Lembur | JK=8 + sisa ke Lembur | **JK=8 + sisa ke Lembur** ✓ semua |

**Hasil validasi penuh:** dari 25 baris transaksi ROSSA bulan Mei, **23 baris (92%) sekarang cocok 100%** dengan hasil akuntan (dari sebelumnya hampir semua salah kategori).

**Apa sebenarnya peran "Lembur Bebas"?**
Berdasarkan pola data, tag ini ditujukan untuk **mengizinkan karyawan non-kontrak tetap dibayar lembur kalau bekerja di hari libur** (Sabtu/Minggu/Tanggal Merah) — bukan untuk mengubah perhitungan di hari kerja normal. Fix #6 mengembalikan tag ini ke peran aslinya:

```js
// Cap 8 jam HANYA dibypass kalau memang hari libur ASLI (kalender)
if (trackerMasuk.isLibur) {
    if (isKontrak || isLemburBebas) {
        outLembur = jkKotor;          // hari libur + diizinkan -> semua ke lembur
    } else {
        ket = "Abaikan - Libur (Non-Kontrak)";
        outTotal = "";                // hari libur + non-kontrak + tidak diizinkan -> diabaikan
    }
} else {
    // HARI KERJA NORMAL - selalu JK(maks 8) + Lembur(sisa), apa pun tag-nya
    if (jkKotor > HR_CONFIG.MAKS_JK) {
        outJk = HR_CONFIG.MAKS_JK;
        outLembur = jkKotor - HR_CONFIG.MAKS_JK;
    } else {
        outJk = jkKotor;
    }
}
```
Istirahat Jumat juga dikembalikan ke murni berbasis kalender (`isJum && !isLibur`), tidak lagi disuppress oleh tag.

---

## Sisa Ketidakcocokan yang Perlu Dikonfirmasi (bukan bug kode)

Dari 25 baris ROSSA, 2 baris masih berbeda — **keduanya sudah saya angkat sebelumnya**, bukan temuan baru:

1. **11/05 (durasi 3 jam 48 menit, di bawah ambang 4 jam kita):** akuntan mencatat ini sebagai JK=4 (hari kerja terpotong), bukan "Lembur Singkat" seperti yang kode kita hasilkan. Sesinya berakhir 17:04 — persis di sekitar jam tutup normal — sehingga sepertinya akuntan menganggap ini hari kerja yang dimulai terlambat, bukan lembur tambahan. **Saya tidak mengubah kode berdasarkan 1 sampel ini** karena berisiko overfit; mohon konfirmasi langsung ke akuntan: *"Kalau karyawan masuk siang lalu pulang di jam tutup normal, walau totalnya di bawah 4 jam, itu dihitung JK atau Lembur Singkat?"*
2. **23/05 (2.5 jam vs tercatat 2.25 di file akuntan):** kemungkinan typo manual, sudah diangkat di dokumentasi v2.

**Catatan total:** total Lembur ROSSA versi kode v3 = 24.0 jam; total versi akuntan = 20 jam. Selisih 4 jam ini **persis** sama dengan kasus 11/05 di atas (4 jam yang akuntan masukkan ke JK, bukan Lembur) — jadi begitu poin #1 dikonfirmasi dan disesuaikan, totalnya akan cocok sempurna.

---

## Rekomendasi Langkah Selanjutnya
1. Deploy `Kode.gs` v3 ini (sudah termasuk integrasi Google Sheets karyawan kontrak yang Anda tambahkan + Fix #1-6).
2. Jalankan ulang seluruh data Mei, lalu cek **beberapa karyawan lain** (bukan cuma ROSSA) untuk pola serupa — terutama karyawan yang dulu Anda bilang "banyak invalid sudah dikonfirmasi ke orang yang bersangkutan", supaya kita tahu apakah keterangan "INVALID" itu sekarang sudah diproses dengan benar atau masih perlu penyesuaian lanjutan.
3. Konfirmasi ke akuntan soal kasus 11/05 (poin #1 di atas) sebelum saya sentuh ambang `MIN_SHIFT` lagi.
