# Dokumentasi Perbaikan Sistem Payroll v2
**PT. Perfect Garmen Accessories — SIJeJar Payroll Engine**

Dokumen ini menjelaskan 5 perbaikan yang diterapkan ke `Kode.gs`, hasil audit terhadap perbandingan `Data Mentah → Output Current System → Hasil Olahan Akuntan` bulan Mei 2026, dan konfirmasi langsung dari akuntan terkait aturan pembulatan.

Semua fix sudah disimulasikan ulang (di luar Apps Script, pakai Python) terhadap data mentah Mei untuk 2 karyawan shift malam/reguler (HARI HANGGARA & ROSSA RECHTISIA) sebelum diserahkan, dan hasilnya **konsisten dengan pola perhitungan manual akuntan**.

---

## Fix #1 — Cross-Midnight (Shift Malam Lintas Hari)

**Bug:** Kode lama mengecek `if (dtKeluar < dtMasuk)` untuk mendeteksi shift yang lewat tengah malam. Masalahnya, `dtKeluar` dan `dtMasuk` adalah objek `Date` LENGKAP (sudah termasuk tanggal) — untuk shift malam yang valid, tanggal `dtKeluar` selalu LEBIH BESAR dari `dtMasuk` (karena memang hari berikutnya), sehingga kondisi ini **tidak pernah terpenuhi**. Akibatnya jam keluar pagi (mis. 05:01) dihitung sebagai "jam 5", bukan "jam 29" — total jam kerja jadi negatif dan dipotong menjadi 0.

**Dampak nyata di data:** Karyawan shift malam (HARI HANGGARA) kehilangan ~9 jam kerja setiap shift malam yang valid. Sebelum fix: `JK=0.0, Lembur=0.0` untuk shift 20:00→05:01. Setelah fix: `JK=0, Lembur=8.0` (benar).

**Perbaikan:**
```js
function stripTime(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
// ...
var dayDiff = Math.round((stripTime(dtKeluar) - stripTime(dtMasuk)) / 86400000);
kDecimal += dayDiff * 24;
```
Sekarang yang dihitung adalah **selisih tanggal murni** (berapa hari berbeda), bukan perbandingan `Date` penuh, sehingga jam keluar dini hari otomatis dikonversi ke skala 24+ jam tanpa peduli berapa hari shift itu berlangsung.

---

## Fix #2 — Filter Duplikat Status Berurutan (Masuk-Masuk / Keluar-Keluar)

**Bug:** Mesin fingerprint kadang mencatat dua tap berurutan dengan status SAMA (mis. dua "C/Masuk" hanya berjarak 15 menit). Kode lama tetap memperlakukan tap kedua sebagai penutup pasangan shift (karena begitu `trackerMasuk` terisi, event apa pun menutupnya, apa pun statusnya). Ini membuat shift singkat palsu (0.25 jam) tercatat, lalu absen keluar yang ASLI keesokan paginya kehilangan pasangan dan jatuh ke `"INVALID (Belum ada Masuk)"` — **seluruh shift malam itu hilang dari rekap**.

**Dampak nyata di data:** HARI HANGGARA, 22/05 19:42 & 19:57 (selisih 15 menit, dua-duanya "C/Masuk") → shift malam 22-23 Mei (seharusnya ~10.5 jam) sebelumnya hilang total dari rekap.

**Perbaikan:** Tambahkan filter universal **sebelum** logika pairing, dijalankan untuk setiap baris absen:
```js
if (prevEvent !== null && a.status === prevEvent.status) {
    var gapDuplikat = (dtCurrent.getTime() - prevEvent.dt.getTime()) / (1000*60*60);
    if (gapDuplikat >= 0 && gapDuplikat < HR_CONFIG.BATAS_WAKTU.DUPLIKAT_STATUS) {
        // tandai duplikat, SKIP — trackerMasuk tidak disentuh
        continue;
    }
}
```
**Mengapa ambang 1 jam aman?** Diuji terhadap kasus di mana label status memang salah tapi mewakili shift ASLI yang berbeda (contoh: ROSSA RECHTISIA, 3 hari berturut-turut absen keluarnya sama-sama tertulis "C/Masuk", padahal itu adalah hari kerja berbeda yang jaraknya 9–15 jam). Karena jarak antar event itu jauh di atas 1 jam, filter ini **tidak** salah menghapus data ROSSA — hanya menangkap duplikat tap mesin yang memang selalu terjadi dalam hitungan menit.

---

## Fix #3 — Pembulatan Jam Keluar Efektif (Aturan B)

**Bug:** Kode lama pakai `Math.round(kDecimal * 2) / 2`. `Math.round()` bawaan JavaScript membulatkan tie tepat-di-tengah ke ATAS. Setelah dikonfirmasi ke akuntan, aturan sebenarnya:
> 17:16–17:45 → 0.5 jam tambahan (naik ke 17:30 / 05:45) | 17:46–18:15 → 1 jam (naik ke 18:00 / 06:00), dst.

Artinya **tie di menit ke-15 dibulatkan ke BAWAH**, bukan ke atas seperti default JS.

**Perbaikan:** fungsi custom pengganti `Math.round()`:
```js
function bulatkanKe30Menit(totalMenit) {
    totalMenit = Math.round(totalMenit);
    var sisa = totalMenit % 30;
    return (sisa <= 15) ? (totalMenit - sisa) : (totalMenit - sisa + 30);
}
```
Dipakai untuk jam keluar efektif (dalam satuan menit), hasilnya dikonversi balik ke jam.

---

## Fix #4 — Pembulatan Lembur Singkat (Aturan D)

**Bug:** Kode lama pakai `Math.round(diffHours * 4) / 4` (bulatkan ke 0.25 jam terdekat). Setelah diuji terhadap 15 kasus lembur singkat nyata di data akuntan, rumus ini hanya cocok 9/15 (60%). Aturan asli akuntan ternyata identik dengan Fix #3 (pembulatan 30 menit, tie turun), bukan pembulatan 0.25 jam.

**Verifikasi:** dengan `bulatkanKe30Menit()`, kecocokan naik jadi 13/15 (87%) — 2 sisanya kemungkinan typo manual akuntan saat itu (lihat bagian "Catatan & Yang Perlu Dikonfirmasi" di bawah).

**Perbaikan:**
```js
var menitLemburKasar = diffHours * 60;
var menitLemburEfektif = bulatkanKe30Menit(menitLemburKasar);
outLembur = menitLemburEfektif / 60;
```

---

## Fix #5 — Lembur Singkat ≤ 15 Menit "Tidak Dihitung"

**Konfirmasi akuntan:** *"0.25 jadi tidak ada"* — durasi lembur singkat yang sisa menitnya ≤15 (sehingga dibulatkan ke 0 menit oleh Fix #4) **tidak dicatat sebagai lembur sama sekali**, bukan dicatat sebagai 0.

**Perbaikan:**
```js
if (menitLemburEfektif === 0) {
    outLembur = "";
    outTotal = "";
    ket = "Tidak Dihitung (Lembur < 15 Menit)" + (ket ? " - " + ket : "");
} else {
    outLembur = menitLemburEfektif / 60;
    outTotal = outLembur;
    ket = "Lembur Singkat" + (ket ? " (" + ket + ")" : "");
}
```
Baris ini juga **tidak** ikut dihitung ke "Jam Kerja Total" / akumulasi hari kerja karyawan, karena `outTotal=""`.

---

## Hasil Validasi (simulasi Python terhadap Data Mentah Mei)

| Kasus | Sebelum Fix | Setelah Fix | Status |
|---|---|---|---|
| HARI HANGGARA, 11/05 20:00 → 12/05 05:01 (shift malam normal) | JK=0.0, Lembur=0.0 | Lembur=8.0 | ✅ Sesuai pola akuntan |
| HARI HANGGARA, 22/05 19:42 & 19:57 → 23/05 08:01 (double-tap + shift malam) | Shift hilang total ("INVALID") | Duplikat terdeteksi, shift malam tertangkap (10.5 jam) | ✅ Diperbaiki |
| ROSSA RECHTISIA, 06/05 20:22→20:37 (15 menit) | Lembur=0.25 | Tidak Dihitung | ✅ Sesuai konfirmasi akuntan |
| ROSSA RECHTISIA, 14/05 20:38→21:30 (52 menit) | Lembur=0.75 (round 0.25) | Lembur=1.0 | ✅ Cocok data akuntan |
| ROSSA RECHTISIA, 15/05 09:07→11:00 | Lembur=2.0 (kebetulan sama) | Lembur=2.0 | ✅ Tetap cocok |
| ROSSA RECHTISIA, 12-14/05 (3 hari, status keluar salah tertulis "C/Masuk") | Tetap 8.0/hari (tidak terganggu Fix #2 karena gap >1 jam) | 8.0/hari | ✅ Tidak rusak oleh fix baru |

---

## Catatan & Yang Perlu Dikonfirmasi ke Akuntan

1. **ROSSA RECHTISIA, 23/05 13:42→16:09 (2 jam 27 menit):** Rumus baru menghasilkan **2.5 jam**, tapi di file Hasil Akuntan tercatat **2.25 jam**. Ini satu-satunya kasus dari 15 sampel yang masih tidak cocok dengan rumus 30-menit yang sudah dikonfirmasi. Kemungkinan ini salah catat manual saat itu — mohon dikonfirmasi, supaya kalau memang typo, tidak perlu ada exception khusus di kode.
2. **Ambang 1 jam untuk Fix #2** (filter duplikat) adalah nilai yang saya pilih berdasarkan pola data yang ada (gap duplikat nyata di data = 15 menit, gap shift asli minimal ~4 jam). Kalau di lapangan ada kasus karyawan benar-benar absen-masuk-lagi dalam rentang <1 jam karena alasan sah (mis. izin keluar sebentar lalu balik), baris itu akan otomatis diabaikan dan perlu direview manual — silakan beri tahu saya kalau ini perlu disesuaikan.

---

## File Terkait
- `Kode.gs` — kode revisi lengkap dengan 5 fix di atas (komentar `FIX #1`–`FIX #5` ditandai langsung di kode untuk memudahkan tracing).

## Langkah Selanjutnya yang Disarankan
1. Deploy `Kode.gs` revisi ke Apps Script project (ganti file lama).
2. Jalankan ulang seluruh Data Mentah Mei lewat sistem, lalu bandingkan **Total Akumulasi per karyawan** dengan Hasil Olahan Akuntan secara menyeluruh (bukan cuma 2 karyawan sampel ini) sebelum dipakai untuk payroll riil bulan berjalan.
3. Kalau ditemukan karyawan lain dengan pola anomali baru yang belum tertangkap kelima fix ini, kumpulkan dulu contoh konkretnya (nama, tanggal, jam) sebelum saya revisi lagi — supaya perbaikan tetap berbasis bukti, bukan tebakan.
