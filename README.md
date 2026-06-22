# Dokumentasi Sistem Automasi Rekap & Payroll
**PT. Perfect Garmen Accessories**

Sistem ini berbasis Google Apps Script (App Script) yang dirancang untuk mengotomatisasi ekstraksi, pembersihan, dan perhitungan data absensi mentah dari mesin sidik jari (*fingerprint*) menjadi laporan *payroll* (penggajian) yang matang, lengkap dengan pemisahan Jam Kerja (JK) standar dan Lembur.

---

## 1. Arsitektur Sistem
Sistem ini terdiri dari dua file utama:
* **`index.html` (Frontend):** Antarmuka pengguna (UI) berbasis web yang menggunakan *Tailwind CSS* untuk tata letak dan pustaka `xlsx.js` untuk mengurai file Excel mentah langsung di sisi klien (*browser*) sebelum dikirim ke server.
* **`Kode.gs` (Backend):** Logika utama yang berjalan di server Google. Bertugas menerapkan aturan HR, perhitungan matematika *payroll*, deteksi anomali (*failsafe*), dan pembuatan/pewarnaan file Google Sheets output.

---

## 2. Parameter Konfigurasi (`HR_CONFIG`)
Konfigurasi dasar dapat disesuaikan pada bagian atas file `Kode.gs` tanpa mengubah logika inti program.

* **Hari Kerja:** Senin - Jumat (Sabtu dan Minggu non-aktif untuk karyawan reguler).
* **Istirahat:** 1 Jam (Hari Normal) | 1.5 Jam (Hari Jumat).
* **Batas Waktu (Failsafe):**
    * `< 0.08 Jam (5 Menit)` = *Double Scan* (Abaikan).
    * `< 4.0 Jam` = Lembur Singkat.
    * `> 16.0 Jam` = Lupa Absen Keluar (Error).
* **Maksimal Jam Kerja (JK):** 8 Jam per hari. Sisa durasi otomatis masuk ke Lembur.

---

## 3. Algoritma & Aturan Bisnis (Business Rules)

Program ini memproses data berdasarkan pembacaan kronologis (baris demi baris) dengan **Kolom Status (C/Masuk atau C/Keluar) sebagai pemicu utama**, didukung oleh validasi waktu.

### A. Aturan Jam Masuk Efektif (*Early In Restriction*)
Karyawan yang datang lebih awal tidak mendapatkan tambahan jam kerja/lembur.
* Shift Pagi: Datang `≤ 08:00` $\rightarrow$ Dihitung masuk `08:00`. Datang `> 08:00` $\rightarrow$ Dihitung sesuai jam aktual.
* Shift Malam: Datang `≤ 20:00` $\rightarrow$ Dihitung masuk `20:00`. Datang `> 20:00` $\rightarrow$ Dihitung sesuai jam aktual.

### B. Aturan Jam Keluar Efektif (*Floor Rounding*)
Jam keluar aktual dibulatkan ke bawah (*floor*) ke interval 30 menit (0.5 jam) terdekat untuk mempermudah perhitungan *payroll*.
* *Rumus:* `Math.round(Jam Keluar Aktual * 2) / 2`

### C. Aturan Lembur Singkat (*Short Overtime*)
Jika rentang waktu absen Masuk dan Keluar **kurang dari 4 jam**, sistem menganggapnya sebagai lembur singkat/tambahan (bukan shift penuh).
* Tidak ada pemotongan jam istirahat.
* Durasi dibulatkan ke interval 15 menit (0.25 jam) terdekat.

### D. Aturan Karyawan Kontrak & Hari Libur
Sistem membedakan perlakuan berdasarkan hari kalender (API Kalender Nasional) dan status pegawai.
* **Karyawan Kontrak:** Jika bekerja pada hari Sabtu, Minggu, atau Tanggal Merah, nilai Jam Kerja (JK) dikosongkan (0), dan **seluruh durasi kerja dilempar ke kolom Lembur**.
* **Karyawan Non-Kontrak:** Diabaikan jika absen di hari libur.
* **Status "LEMBUR BEBAS":** Jika kolom keterangan berbunyi "LEMBUR BEBAS", sistem akan memaksa perhitungan menjadi lembur total layaknya hari libur, tanpa mengubah warna baris kalender.

---

## 4. Sistem Failsafe (Penanganan Anomali Mesin)

Mesin sidik jari sering mengalami *human error* atau *auto-state error*. Sistem memiliki lapis pengamanan:
1.  **Double Scan (< 5 Menit):** Jika ada dua absen berdekatan, absen kedua diabaikan (diberi status *"Mengulang"*).
2.  **Mesin Salah Tebak Status:** Jika menemukan dua status "C/Masuk" namun jaraknya masuk akal (4 - 16 jam), sistem memaksa data kedua menjadi "C/Keluar" yang sah.
3.  **Lupa Absen Pulang (> 16 Jam):** Jika jarak absen melebihi batas wajar manusia bekerja, baris diwarnai merah dengan keterangan *"LUPA ABSEN KELUAR (> 16 Jam)"*. Data baru dianggap sebagai *shift* hari berikutnya.
4.  **Lanjutan Shift Bulan Lalu:** Jika ditemukan "C/Keluar" tanpa "C/Masuk" di baris **pertama** data seorang karyawan, sistem mengenalinya sebagai sisa shift malam dari bulan sebelumnya dan memberi keterangan *"Abaikan - Lanjutan Shift Bulan Sebelumnya"*.

---

## 5. Legenda Warna Output Laporan

Laporan Excel yang dihasilkan akan diwarnai secara otomatis untuk memudahkan audit visual oleh HRD:

| Warna | Kode Hex | Arti | Logika Pemicu |
| :--- | :--- | :--- | :--- |
| **Putih** | `#FFFFFF` | Hari Kerja Normal | Senin - Kamis. |
| **Kuning** | `#FFFF00` | Hari Jumat | Terdeteksi sebagai hari Jumat (Istirahat 1.5 jam). |
| **Oranye** | `#FFC000` | Hari Libur | Sabtu, Minggu, atau Tanggal Merah Nasional. |
| **Merah Pudar** | `#FFCCCC` | Error / Invalid | Lupa absen keluar, atau absen keluar tanpa absen masuk (kecuali awal bulan). |
| **Hijau Pudar** | `#E2EFDA` | Total Akumulasi | Baris rekapitulasi total hari dan lembur di akhir data per karyawan. |
| **Abu-abu** | `#E7E6E6` | Pemisah Karyawan | *Header* tabel untuk karyawan baru. |

---
*Dokumen ini dibuat secara otomatis untuk keperluan operasional PT. Perfect Garmen Accessories. Terakhir diperbarui: Juni 2026.*