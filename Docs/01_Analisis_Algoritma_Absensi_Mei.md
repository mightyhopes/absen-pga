# Analisis dan Temuan Algoritma Absensi Mei

## Latar Belakang

Dilakukan perbandingan antara:

1. Data Mentah Bulan Mei (Fingerprint)
2. Data Olahan Akuntan/HR
3. Data Output Current System (`Kode.gs`)

Tujuan analisis adalah menemukan penyebab perbedaan hasil antara sistem otomatis dengan hasil olahan akuntan yang selama ini dianggap sebagai referensi utama.

---

# Temuan Utama

## 1. Status Mesin Fingerprint Tidak Dapat Dipercaya

Dari 2206 record absensi ditemukan sekitar 158 record (~7%) yang memiliki pola:

* Masuk → Masuk
* Keluar → Keluar

secara berurutan.

Kondisi ini paling sering terjadi pada:

* Shift malam
* Shift cross-day (melewati tengah malam)

Kesimpulan:

> Kolom Status (`C/Masuk`, `C/Keluar`) tidak dapat dijadikan sumber kebenaran utama untuk proses pairing absensi.

Akuntan ternyata tidak menggunakan kolom status sebagai dasar perhitungan.

---

# Bug #1 - Cross Midnight Salah Total

## Kode Lama

```javascript
var kDecimal = jamToDecimal(dtKeluar);
if (dtKeluar < dtMasuk) kDecimal += 24;
```

Masalah:

`dtKeluar` dan `dtMasuk` adalah objek Date lengkap.

Contoh:

Masuk:

* 11 Mei 20:00

Keluar:

* 12 Mei 05:01

Secara objek Date:

```javascript
12 Mei 05:01 > 11 Mei 20:00
```

sehingga kondisi:

```javascript
dtKeluar < dtMasuk
```

tidak pernah terjadi.

Akibatnya:

```javascript
20:00 -> 20.0
05:01 -> 5.0
```

JK menjadi:

```text
5 - 20 - 1
= -16
```

lalu di-clamp menjadi:

```text
0
```

Padahal shift tersebut valid.

---

## Solusi

Hitung selisih hari terlebih dahulu:

```javascript
var dayDiff =
  Math.round(
    (
      dtKeluar.setHours(0,0,0,0) -
      dtMasuk.setHours(0,0,0,0)
    ) / 86400000
  );

var kDecimal = jamToDecimal(dtKeluar);
kDecimal += dayDiff * 24;
```

---

# Bug #2 - Double Scan Threshold Terlalu Kecil

## Kasus Nyata

Hari Hanggara:

```text
19:42 Masuk
19:57 Masuk
```

Selisih:

```text
15 menit
```

Current System menggunakan threshold sekitar:

```javascript
DOUBLE_SCAN = 0.08 jam
≈ 5 menit
```

Karena 15 menit > 5 menit:

sistem menganggap ini pasangan valid dan menutup transaksi.

Akibatnya scan keluar pagi berikutnya kehilangan pasangan masuk.

Shift penuh menjadi:

```text
INVALID (Belum ada Masuk)
```

---

## Solusi

Naikkan threshold:

```javascript
15 - 20 menit
```

atau gunakan logika:

```text
Jika scan berikutnya masih status sama
dan gap < 30 menit
anggap sebagai salah tap.
```

---

# Root Cause Arsitektur

Sistem saat ini terlalu bergantung pada:

```javascript
isMasukStr
```

yang berasal dari teks status fingerprint.

Padahal data nyata menunjukkan status sering salah.

Akuntan melakukan pairing berdasarkan:

```text
Urutan kronologis
```

yaitu:

```text
Scan ke-1 = Masuk
Scan ke-2 = Keluar
Scan ke-3 = Masuk
Scan ke-4 = Keluar
dst
```

tanpa memperhatikan isi kolom Status.

---

# Rekomendasi Pairing Baru

## Jangan Gunakan Status Sebagai Trigger

Status hanya digunakan untuk:

* audit
* debugging
* tampilan

bukan untuk pairing.

Pairing dilakukan secara alternating:

```text
Masuk
Keluar
Masuk
Keluar
```

berdasarkan urutan waktu.

---

# Analisis Pembulatan Lembur

Awalnya diasumsikan menggunakan:

```javascript
Math.round(diffHours * 4) / 4
```

atau pembulatan 0.25 jam.

Setelah diverifikasi ke data akuntan ternyata teori tersebut tidak konsisten.

---

# Klarifikasi Langsung dari Akuntan

Aturan resmi yang digunakan:

## 1. Tidak Ada Nilai 0.25 Jam

```text
0.25 tidak pernah digunakan.
```

---

## 2. Lembur 0.5 Jam

Shift pagi:

```text
17:16 - 17:45
= 0.5 jam
```

Shift malam:

```text
05:16 - 05:45
= 0.5 jam
```

---

## 3. Lembur 1 Jam

Shift pagi:

```text
17:46 - 18:15
= 1 jam
```

Shift malam:

```text
05:46 - 06:15
= 1 jam
```

Setelah itu pola berulang:

```text
18:16 -> 1.5
18:46 -> 2.0
19:16 -> 2.5
dst
```

---

# Rumus Pembulatan yang Terverifikasi

## Fungsi Resmi

```javascript
function bulatkanKe30Menit(menit) {
  var sisa = menit % 30;
  var dasar = menit - sisa;

  return (sisa <= 15)
    ? dasar
    : dasar + 30;
}
```

Karakteristik penting:

```text
Menit ke-15 dibulatkan turun
Menit ke-45 dibulatkan turun
```

Berbeda dengan:

```javascript
Math.round()
```

yang membulatkan titik tengah ke atas.

---

# Dampak ke Jam Keluar Efektif

Kode lama:

```javascript
var endEffective =
  Math.round(kDecimal * 2) / 2;
```

Salah untuk kasus:

```text
17:15
17:45
```

karena dibulatkan naik.

---

## Contoh

### Kode Lama

```text
17:15 -> 17:30
```

### Aturan Akuntan

```text
17:15 -> 17:00
```

---

# Kesimpulan Akhir

## Fix yang Harus Masuk ke Kode.gs

### Fix #1

Perbaikan perhitungan cross-midnight menggunakan day difference.

### Fix #2

Menaikkan threshold double scan menjadi 15-20 menit atau menggunakan deteksi salah-tap.

### Fix #3

Menghilangkan ketergantungan terhadap kolom Status untuk proses pairing.

### Fix #4

Mengganti seluruh pembulatan lembur dan jam keluar efektif menggunakan fungsi:

```javascript
function bulatkanKe30Menit(menit) {
  var sisa = menit % 30;
  var dasar = menit - sisa;

  return (sisa <= 15)
    ? dasar
    : dasar + 30;
}
```

### Fix #5

Menghapus seluruh konsep pembulatan 0.25 jam karena menurut akuntan:

```text
0.25 tidak ada.
```

---

# Status Saat Ini

Belum dilakukan implementasi final pada `Kode.gs`.

Tahap berikutnya:

1. Implementasi 5 fix di atas.
2. Jalankan ulang terhadap Data Mentah Mei.
3. Bandingkan output baru dengan hasil olahan akuntan.
4. Hitung tingkat kecocokan (accuracy) per karyawan dan total jam kerja/lembur.
