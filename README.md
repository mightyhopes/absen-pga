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
   * Dilengkapi **Error Handling** (`withFailureHandler`) untuk menangkap kegagalan server (timeout, izin) agar *loading spinner* tidak berputar selamanya.
   * Menampilkan tombol **📁 Buka Folder Drive** pada panel Arsip Laporan untuk akses cepat ke seluruh file hasil *generate*.
2. **`Kode.gs` (Backend / Server):**
   * Berjalan di ekosistem Google Workspace.
   * Menarik daftar Karyawan Kontrak (Sheet "KK") dan Harian Lepas (Sheet "HL") dari database pusat Google Sheets (`1sYQ6CQK8JAWEfUXxzf6OkdsTDcfHzRiOA_fOpxXWTyI`).
   * Menjalankan algoritma pemisahan Jam Kerja (JK) dan Lembur, pembulatan waktu toleransi, dan *formatting* output Excel (Warna, *Border*, Legenda).
   * **Google Drive Management:** File hasil *generate* otomatis dipindahkan ke folder `Laporan PGA Engine` (dibuat otomatis jika belum ada). Folder dan file di-set sharing `Anyone with the link` agar bisa diakses/didownload tanpa hambatan izin.

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
Sistem membaca identitas karyawan dari database dan menerapkan perlakuan yang berbeda. Jika karyawan tidak terdaftar di database manapun (KK, Staff), sistem secara default menganggapnya sebagai **HL**.

1. **Hari Kerja Normal (Senin - Jumat):**
   * **KK (Kontrak):** Jika kerja bersih `< 4 Jam` = Dianggap **IZIN** (Total/JK/Lembur = 0, tidak dihitung hari kerja). Jika `>= 4 Jam` = Hadir (Maks 8 Jam JK, sisa Lembur).
   * **HL (Harian Lepas):** Jika kerja bersih `< 8 Jam` = Seluruh jam masuk ke kolom **LEMBUR**, kolom JK dikosongkan (keterangan: *Lembur Singkat (HL < 8 Jam)*). Jika `>= 8 Jam` = Normal (Maks 8 Jam JK, sisa Lembur).
2. **Hari Libur (Sabtu / Minggu / Tanggal Merah):**
   * **KK (Kontrak):** Seluruh jam kerja langsung masuk *full* ke kolom **LEMBUR**. Kolom JK kosong (0).
   * **HL (Harian Lepas):** Berlaku aturan yang sama seperti hari kerja — jika `< 8 Jam`, seluruh jam masuk ke **LEMBUR** (keterangan: *Lembur Libur Singkat (HL < 8 Jam)*). Jika `>= 8 Jam`, Maks 8 Jam JK, sisa Lembur.

### D. Perhitungan Hari Kerja (Total Hari)
Angka `"X hari"` pada baris Total Akumulasi menghitung **hanya hari kerja reguler (bukan hari libur)** secara unik:
* Hanya hari **Senin - Jumat** (non-libur) yang dihitung.
* Jika karyawan masuk 2 shift pada hari reguler yang sama, sistem hanya menghitung **1 hari** (mencegah *double-count*).
* Kehadiran di hari Sabtu/Minggu/Tanggal Merah **tidak** menambah hitungan hari meskipun jam lemburnya tetap tercatat.

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
   * **Tambah Cuti Bersama:** Gunakan form *"Tambah Libur / Cuti Bersama"*. Masukkan "Mulai Tanggal" dan "Sampai Tanggal" (opsional), isi keterangan (opsional, default: "Libur"), lalu klik Tambah.
3. **Proses:** Klik tombol "Generate Laporan AKUMULASI AKTUAL" atau "Generate Laporan AUDIT". Sistem akan memuat data dengan *loading spinner*.
4. **Download:** Setelah selesai, klik tombol **Download .xlsx** (membuka tab baru) atau klik tautan "Buka di Sheets↗".
5. **Akses Folder:** Klik tombol **📁 Buka Folder Drive** di panel Arsip Laporan untuk melihat seluruh file yang pernah di-*generate* (tersimpan rapi di folder `Laporan PGA Engine`).

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
  * `Merah Muda (#FFEEEE)`: Baris detail TMK (tanggal-tanggal Tidak Masuk Kerja).
* **Legenda:** Tabel legenda warna otomatis dibuat di pojok kanan atas untuk pedoman pembacaan.

---

## 6. Manajemen Google Drive

Setiap file Excel hasil *generate* dikelola secara otomatis oleh sistem:
* **Folder Otomatis:** File dipindahkan ke folder `Laporan PGA Engine` (atau `Laporan Audit Digiprint` untuk sistem Digiprint). Folder dibuat otomatis jika belum ada.
* **Sharing:**
  * **File Excel:** Di-set `Anyone with the link` = **Viewer** (bisa lihat dan download).
  * **Folder:** Di-set `Anyone with the link` = **Editor** (bisa mengelola isi folder).
* **Prasyarat Deploy:**
  * Tambahkan scope `https://www.googleapis.com/auth/drive` di `appsscript.json` → `oauthScopes`.
  * Jalankan fungsi `OTORISASI_SISTEM` sekali dari editor Apps Script untuk memancing izin *Full Drive Access*.
  * Deploy sebagai **"Execute as: Me"** dan **"Who has access: Anyone"**.

---

## 7. Konteks Khusus (Sistem Perusahaan Sebelah)

Repositori ini juga memuat dua file dengan penamaan `digi` yaitu:
* `Index.digi.html`
* `digi.gs`

**Perhatian:** Kedua file tersebut adalah kode khusus yang diperuntukkan bagi **Perusahaan Sebelah** yang memiliki aturan bisnis absensi yang berbeda. File-file tersebut berjalan terpisah dari sistem utama PGA (`index.html` dan `Kode.gs`). Jangan mencampur-adukkan logika di dalam `digi` dengan sistem utama PGA. Sistem Digiprint memiliki fitur serupa (folder management, error handling, dan download link) yang terpisah di file-filenya sendiri.

---

## 8. Folder Dokumentasi (`Docs/`)

Selain README utama ini, dokumentasi pendukung diletakkan di dalam folder `Docs/`:
* **Dokumentasi Aktif:** File seperti `AUDIT-ENGINE.md` yang berisi detail fitur terbaru.
* **Arsip Historis:** Dokumentasi mengenai _trial & error_ lama dan sejarah perbaikan (_bug fixes_) dari masa-masa awal telah dikelompokkan ke dalam folder `Docs/Fix_Bug_Jaman_Dulu/` agar tidak membingungkan pengguna baru.

---
*Dokumen ini dibuat untuk operasional PT. Perfect Garmen Accessories. Konfigurasi algoritma disesuaikan secara khusus — terakhir diperbarui Juli 2026.*
