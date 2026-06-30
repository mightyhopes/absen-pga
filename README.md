# Dokumentasi Sistem Automasi Rekap & Payroll (Final)
**PT. Perfect Garmen Accessories**

Sistem ini adalah aplikasi berbasis web (Google Apps Script) yang memproses data mentah absensi dari mesin sidik jari menjadi laporan *payroll* Excel yang matang. Sistem ini dilengkapi dengan antarmuka kalender interaktif untuk HRD, sistem *failsafe* pendeteksi error mesin, dan pemisahan otomatis logika perhitungan antara Karyawan Kontrak (KK) dan Harian Lepas (HL).

---

## 1. Arsitektur Sistem
Sistem terdiri dari dua komponen utama:
1. **`Index.html` (Frontend / Antarmuka Pengguna):**
   * Menggunakan *Tailwind CSS* untuk desain UI.
   * Menggunakan pustaka `xlsx.js` (SheetJS) untuk membaca file Excel secara lokal di *browser* sebelum dikirim ke server.
   * Memiliki fitur *UI Calendar Generation* otomatis yang mendeteksi hari Sabtu/Minggu berdasarkan data Excel, dan memungkinkan HRD menambah hari libur/cuti bersama secara rentang (*multi-date*).
2. **`Kode.gs` (Backend / Server):**
   * Berjalan di ekosistem Google Workspace.
   * Menarik daftar Karyawan Kontrak (Sheet "KK") dan Harian Lepas (Sheet "HL") dari database pusat Google Sheets (`1sYQ6CQK8JAWEfUXxzf6OkdsTDcfHzRiOA_fOpxXWTyI`).
   * Menjalankan algoritma pemisahan Jam Kerja (JK) dan Lembur, pembulatan waktu toleransi, dan *formatting* output Excel (Warna, *Border*, Legenda).

---

## 2. Aturan Bisnis & Logika Perhitungan Waktu

Sistem mematuhi SOP HRD dengan perhitungan matematis yang ketat:

### A. Toleransi 15 Menit (Masuk & Keluar)
* **Jam Masuk:** Telat `<= 15 menit` dibulatkan kembali ke jam pas (Aman). Telat `16 - 45 menit` dibulatkan menjadi telat setengah jam (30 menit). Telat `> 45 menit` dibulatkan ke jam berikutnya.
* **Jam Keluar:** Pulang lebih cepat `< 15 menit` dibulatkan ke bawah ke jam pas (Potong setengah jam). Pulang lebih dari jam pas `<= 15 menit` dibulatkan ke jam pas (Tidak dihitung lembur/Aman).

### B. Istirahat
* **Hari Normal (Senin - Kamis):** Dipotong 1.0 Jam.
* **Hari Jumat:** Dipotong 1.5 Jam.
* **Hari Libur/Sabtu/Minggu:** Dipotong 1.0 Jam (kecuali untuk KK yang aturan lemburnya berbeda).

### C. Pemisahan Logika KK vs HL
Sistem membaca identitas karyawan dari database dan menerapkan perlakuan yang berbeda:
1. **Hari Kerja Normal (Senin - Jumat):**
   * **KK (Kontrak):** Jika kerja bersih `< 4 Jam` = Dianggap **IZIN** (Total/JK/Lembur = 0, tidak dihitung hari kerja). Jika `>= 4 Jam` = Hadir (Maks 8 Jam JK, sisa Lembur).
   * **HL (Harian Lepas):** Dibayar sesuai aktual. Berapa pun jam kerjanya (misal 3 jam), akan masuk ke kolom JK dengan status **Kerja Singkat (HL)**. Maksimal JK 8 Jam, sisa Lembur.
2. **Hari Libur (Sabtu / Minggu / Tanggal Merah):**
   * **KK (Kontrak):** Seluruh jam kerja langsung masuk *full* ke kolom **LEMBUR**. Kolom JK kosong (0).
   * **HL (Harian Lepas):** Tetap mengisi **JK** terlebih dahulu (Maksimal 8 Jam), barulah sisanya masuk ke kolom Lembur.

### D. Deteksi "Lembur Singkat" vs "Izin"
Sistem membedakan shift pendek (pulang sakit) dengan lembur malam dengan melihat pola:
* Jika durasi `< 4 Jam`, namun karyawan memiliki jam masuk *"random"* (misal jam 13:00 atau jam 21:00), atau terdeteksi sudah memiliki shift normal sebelumnya di hari yang sama $\rightarrow$ Dihitung sebagai **Lembur Singkat**.

### E. Engine TMK (Tidak Masuk Kerja)
Khusus untuk karyawan berstatus **KK (Kontrak)**, sistem dilengkapi dengan perhitungan TMK terotomatisasi di akhir *payroll*:
* **Hari Kerja Efektif:** Dihitung berdasarkan rentang kalender di bulan terkait, di luar Sabtu, Minggu, dan target libur (yang diset HRD di *frontend*).
* **Hari Hadir Valid:** Karyawan dianggap hadir jika terdapat pasangan sesi Masuk-Keluar dan durasi kerjanya valid (contoh: bukan "Izin" yang nilainya hangus).
* **Hasil (Output):** Jika ada selisih antara Hari Efektif dan Hadir Valid, maka akan memunculkan nilai TMK di baris `TOTAL AKUMULASI` (misal: `TMK: 2 hari`). Jika TMK lebih dari 0, sistem juga akan menyisipkan satu baris khusus berwarna merah muda yang merinci daftar tanggal ketidakhadirannya agar mudah dilacak.

---

## 3. Sistem Failsafe (Penanganan Anomali Mesin)

Mesin sering mencatat status yang salah (*human error*). Sistem menangani ini dengan:
1. **Double Scan (< 5 Menit):** Absen berdekatan dicoret dan diberi status *"Mengulang (Abaikan)"*.
2. **Duplikat Status (< 1 Jam):** Jika ada dua "C/MASUK" berurutan dalam waktu kurang dari 1 jam, absen kedua diabaikan.
3. **Lupa Absen Pulang (> 16 Jam):** Jika jarak Masuk ke Keluar melampaui batas logis manusia bekerja (>16 jam), kolom JK & Lembur akan dikosongkan, baris diwarnai Merah, dan diberi status *"LUPA ABSEN KELUAR"*. HRD harus mengecek CCTV/manual.
4. **Lanjutan Shift Bulan Lalu:** Jika data paling atas diawali dengan "C/KELUAR" tanpa "C/MASUK", sistem memakluminya sebagai shift malam dari bulan sebelumnya dan memberi status *"Abaikan - Lanjutan Shift"*.

---

## 4. Panduan Penggunaan Frontend (UI HRD)

1. **Upload File:** Buka aplikasi web, klik kotak area upload, dan pilih file Excel mentah (`.xlsx` atau `.xls`) dari mesin sidik jari.
2. **Konfigurasi Kalender (PENTING):**
   * Sistem akan otomatis merender daftar Hari Sabtu dan Minggu berdasarkan bulan di file Excel tersebut.
   * **Batal Libur:** Jika hari Sabtu tertentu ditetapkan sebagai hari kerja produksi, HRD cukup *menghilangkan centang (uncheck)* pada tanggal tersebut.
   * **Tambah Cuti Bersama:** Gunakan form *"Tambah Libur / Cuti Bersama"*. Masukkan "Mulai Tanggal" dan "Sampai Tanggal" (opsional), isi keterangan, lalu klik Tambah.
3. **Proses:** Klik tombol "Mulai Proses Algoritma Payroll". Sistem akan memuat data dengan *loading spinner*.
4. **Download:** Setelah selesai, klik tombol Download Laporan (.xlsx) atau klik tautan "Buka di Google Sheets".

---

## 5. Tata Letak Output (Laporan Excel Akhir)

Excel yang dihasilkan akan diformat secara otomatis:
* **Tabel Terpisah:** Setiap karyawan memiliki blok tabel dengan *border* penuh, dipisahkan dengan baris jeda putih, membuat laporan sangat rapi.
* **Header Gelap:** Setiap awal tabel karyawan memiliki header warna gelap (`#3B3838`) dan *font* putih, disertai status tipe karyawan di sebelah namanya (contoh: `GUSTIO TRY MAHENDRA (KK)`).
* **Desimal Terkunci:** Angka jam kerja maksimal 2 angka di belakang koma.
* **Pewarnaan Baris (Berdasarkan Kalender):**
  * `Putih`: Hari Kerja Normal.
  * `Kuning`: Hari Jumat.
  * `Oranye`: Hari Libur (Weekend / Tanggal Merah).
  * `Merah Pudar`: Error / Invalid / Lupa Absen.
* **Legenda:** Tabel legenda warna otomatis dibuat di pojok kanan atas untuk pedoman pembacaan.

---

## 6. Konteks Khusus (Sistem Perusahaan Sebelah)

Repositori ini juga memuat dua file dengan penamaan `digi` yaitu:
* `Index.digi.html`
* `digi.gs`

**Perhatian:** Kedua file tersebut adalah kode khusus yang diperuntukkan bagi **Perusahaan Sebelah** yang memiliki aturan bisnis absensi yang berbeda. File-file tersebut berjalan terpisah dari sistem utama PGA (`index.html` dan `Kode.gs`). Jangan mencampur-adukkan logika di dalam `digi` dengan sistem utama PGA.

---

## 7. Folder Dokumentasi (`Docs/`)

Selain README utama ini, dokumentasi pendukung diletakkan di dalam folder `Docs/`:
* **Dokumentasi Aktif:** File seperti `AUDIT-ENGINE.md` yang berisi detail fitur terbaru.
* **Arsip Historis:** Dokumentasi mengenai _trial & error_ lama dan sejarah perbaikan (_bug fixes_) dari masa-masa awal telah dikelompokkan ke dalam folder `Docs/Fix_Bug_Jaman_Dulu/` agar tidak membingungkan pengguna baru.

---
*Dokumen ini dibuat untuk operasional PT. Perfect Garmen Accessories. Konfigurasi algoritma disesuaikan secara khusus pada Juni 2026.*
