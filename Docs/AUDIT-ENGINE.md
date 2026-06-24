# Audit Engine Documentation

## Latar Belakang

Divisi HR dan Akuntan membutuhkan dua jenis output berbeda dari data fingerprint:

1. Payroll
2. Audit

Karena kebutuhan audit berbeda dengan payroll, maka sistem menggunakan dua engine terpisah.

---

# Payroll

Mode Payroll menggunakan data aktual fingerprint.

Referensi sheet:

- KK
- HL

Output payroll mengikuti aturan absensi sebenarnya.

---

# Audit

Mode Audit menggunakan data normalisasi.

Referensi sheet:

- HB
- RJ
- EL
- Lainnya

Output audit bukan data fingerprint asli.

Output audit merupakan data yang telah dinormalisasi mengikuti kebutuhan audit perusahaan.

---

# Flow Audit

## 1. Upload Raw Fingerprint

User mengunggah file fingerprint mentah.

---

## 2. Generate Kalender Audit

Sistem otomatis membuat:

- Sabtu
- Minggu

berdasarkan bulan yang terdeteksi dari file absensi.

HR dapat:

- mengaktifkan/nonaktifkan Sabtu
- mengaktifkan/nonaktifkan Minggu
- menambahkan tanggal merah
- menambahkan cuti bersama
- menambahkan libur perusahaan

---

## 3. Filtering Hari

Semua transaksi pada tanggal berikut diabaikan:

- Sabtu aktif
- Minggu aktif
- Tanggal Merah aktif
- Cuti Bersama aktif
- Libur Perusahaan aktif

---

## 4. Normalisasi Shift

Dalam mode Audit:

Tidak ada Shift Malam.

Seluruh karyawan dianggap Shift Pagi.

---

## 5. Normalisasi Jam Masuk

Jam masuk dibuat ulang secara acak:

Range:

07:50 - 08:05

Contoh:

07:51
07:58
08:04

Random dilakukan setiap generate.

Tidak deterministic.

---

## 6. Normalisasi Jam Pulang

### Senin - Kamis

Range:

17:00 - 17:10

### Jumat

Range:

17:30 - 17:40

---

# Sistem Lembur Audit

## Prinsip Dasar

Lembur dihitung berdasarkan departemen.

Bukan berdasarkan individu.

Jika departemen lembur maka seluruh anggota departemen lembur.

---

# Departemen HB

Lembur:

2-3 kali per bulan

Random.

Durasi:

3 jam

---

# Departemen RJ

Lembur:

2-3 kali per bulan

Random.

Durasi:

3 jam

---

# Departemen EL

Lembur:

2-3 kali per bulan

Random.

Durasi:

3 jam

---

# Sheet Lainnya

Berisi:

- Head Production
- Mekanik
- Staff tertentu

Aturan:

Tidak boleh lembur sendiri.

Harus mengikuti salah satu departemen:

- HB
- RJ
- EL

---

# Durasi Lembur Sheet Lainnya

Pilihan:

- 1 jam
- 1.5 jam
- 2 jam

Random.

---

# Normalisasi Jam Pulang Saat Lembur

## HB / RJ / EL

Jam pulang dasar:

17:00-17:10

atau

17:30-17:40 (Jumat)

ditambah:

3 jam

---

## Sheet Lainnya

Jam pulang dasar:

17:00-17:10

atau

17:30-17:40

ditambah:

- 1 jam
- 1.5 jam
- 2 jam

---

# Tujuan Audit

Audit digunakan untuk:

- Rekap audit internal
- Simulasi laporan audit
- Penyamaan format data audit
- Menghilangkan pengaruh shift malam
- Menghilangkan pengaruh hari libur
- Menjaga konsistensi distribusi lembur antar departemen
