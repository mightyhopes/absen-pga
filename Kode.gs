function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('HR Portal - PT. Perfect Garmen Accessories')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ==========================================
// ⚙️ KONFIGURASI HR & PAYROLL 
// ==========================================
var HR_CONFIG = {
    WORKDAY: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false },
    ISTIRAHAT: { NORMAL: 1.0, JUMAT: 1.5 },
    BATAS_WAKTU: {
        DOUBLE_SCAN: 0.08, // 5 Menit (Jika < 5 menit dianggap Mengulang)
        DUPLIKAT_STATUS: 1.0, // 1 Jam (Status sama berurutan)
        MIN_SHIFT: 4.0,    // Batas bawah Shift Normal
        MAX_SHIFT: 16.0    // Batas atas sebelum dianggap Lupa Absen Keluar
    },
    MAKS_JK: 8 // Maksimal Jam Kerja normal
};

// ==========================================
// 🧠 HELPER FUNCTION
// ==========================================
function parseWaktu(waktuStr) {
    var parts = waktuStr.split(' ');
    var tglParts = parts[0].split('/');
    var jamParts = (parts.length > 1 ? parts[1] : "00.00").split(/[:.]/);
    return new Date(tglParts[2], tglParts[1] - 1, tglParts[0], jamParts[0], jamParts[1]);
}

function jamToDecimal(dateObj) {
    return dateObj.getHours() + (dateObj.getMinutes() / 60);
}

function stripTime(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function bulatkanKe30Menit(totalMenit) {
    totalMenit = Math.round(totalMenit); 
    var sisa = totalMenit % 30;
    if (sisa < 0) sisa += 30; 
    var dasar = totalMenit - sisa;
    return (sisa <= 15) ? dasar : dasar + 30;
}

// ==========================================
// 🚀 MAIN PROCESSOR (CORE ALGORITHM)
// ==========================================
function prosesDataAbsensiServer(dataArray) {
  try {
    var hasil = [];
    var warna = []; 
    var dataPerNama = {};
    var urutanNama = [];

    // --- TAHAP 0: TARIK DATA KARYAWAN KONTRAK DARI GOOGLE SHEETS ---
    var idSheetKontrak = '1sYQ6CQK8JAWEfUXxzf6OkdsTDcfHzRiOA_fOpxXWTyI';
    var sheetKontrak = SpreadsheetApp.openById(idSheetKontrak).getSheets()[0];
    var dataRangeKontrak = sheetKontrak.getRange("B2:B32").getValues();
    
    var KARYAWAN_KONTRAK = [];
    for (var r = 0; r < dataRangeKontrak.length; r++) {
        var namaDariSheet = String(dataRangeKontrak[r][0]).trim().toUpperCase();
        if (namaDariSheet !== "") {
            KARYAWAN_KONTRAK.push(namaDariSheet);
        }
    }

    // --- TAHAP 1: API KALENDER NASIONAL ---
    var idKalender = 'id.indonesian#holiday@group.v.calendar.google.com';
    var kalender = CalendarApp.getCalendarById(idKalender);
    var allEvents = kalender.getEvents(new Date(2025, 0, 1), new Date(2027, 11, 31));
    var cacheLibur = {}; 
    for (var e = 0; e < allEvents.length; e++) {
       cacheLibur[Utilities.formatDate(allEvents[e].getStartTime(), "Asia/Jakarta", "dd/MM/yyyy")] = true;
    }

    // --- TAHAP 2: GROUPING DATA ---
    for (var i = 1; i < dataArray.length; i++) {
      var row = dataArray[i];
      if (!row || row.length < 3 || !row[0]) continue;
      
      var nama = String(row[0]).trim();
      if (!dataPerNama[nama]) { dataPerNama[nama] = []; urutanNama.push(nama); }
      dataPerNama[nama].push({ 
          nama: nama, waktuStr: String(row[1]).trim(), 
          status: String(row[2]).trim().toUpperCase(),
          pengecualian: row.length > 3 && row[3] ? String(row[3]).trim().toUpperCase() : ""
      });
    }

    function warnaBaris(hex) { warna.push([hex, hex, hex, hex, hex, hex, hex]); }

    // --- TAHAP 3: ALGORITMA PAYROLL ---
    for (var n = 0; n < urutanNama.length; n++) {
      var namaKaryawan = urutanNama[n];
      var absenKaryawan = dataPerNama[namaKaryawan];
      
      // Validasi status kontrak menggunakan array yang diambil dari Sheet
      var isKontrak = (KARYAWAN_KONTRAK.indexOf(namaKaryawan.toUpperCase()) !== -1);

      hasil.push(["Nama", "Waktu", "Status", "Jam Kerja Total", "JK", "Lembur", "Keterangan"]);
      warnaBaris("#E7E6E6");

      var totalLemburKaryawan = 0;
      var totalHariKaryawan = 0; 
      var trackerMasuk = null; 
      var prevEvent = null;

      for (var k = 0; k < absenKaryawan.length; k++) {
        var a = absenKaryawan[k];
        var dtCurrent = parseWaktu(a.waktuStr);
        var tglCekStr = a.waktuStr.split(' ')[0];
        var dayIndex = dtCurrent.getDay();
        
        // LOGIKA WARNA (Murni Berdasarkan Kalender)
        var isHariKerja = HR_CONFIG.WORKDAY[dayIndex];
        var isTanggalMerah = cacheLibur[tglCekStr] || false;
        var isHariLibur = (!isHariKerja || isTanggalMerah); 
        var isJumat = (dayIndex === 5);
        
        var currentColor = "#FFFFFF"; 
        if (isHariLibur) currentColor = "#FFC000"; 
        else if (isJumat) currentColor = "#FFFF00"; 

        if (prevEvent !== null && a.status === prevEvent.status) {
            var gapDuplikat = (dtCurrent.getTime() - prevEvent.dt.getTime()) / (1000 * 60 * 60);
            if (gapDuplikat >= 0 && gapDuplikat < HR_CONFIG.BATAS_WAKTU.DUPLIKAT_STATUS) {
                hasil.push([a.nama, a.waktuStr, a.status, "", "", "", "Mengulang - Status Sama Berurutan (Diabaikan)"]);
                warnaBaris(currentColor);
                prevEvent = { dt: dtCurrent, status: a.status };
                continue;
            }
        }
        prevEvent = { dt: dtCurrent, status: a.status };

        var isMasukStr = a.status.includes("MASUK");

        if (trackerMasuk === null) {
            if (isMasukStr) {
                trackerMasuk = { dt: dtCurrent, a: a, rowIndex: hasil.length, isLibur: isHariLibur, isJum: isJumat };
                hasil.push([a.nama, a.waktuStr, a.status, "", "", "", a.pengecualian]);
                warnaBaris(currentColor);
            } else {
                var keteranganError = "INVALID (Belum ada Masuk)";
                if (k === 0) {
                    keteranganError = "Abaikan - Lanjutan Shift Bulan Sebelumnya";
                }
                
                hasil.push([a.nama, a.waktuStr, a.status, "", "", "", keteranganError]);
                warnaBaris("#FFCCCC"); 
            }
        } else {
            var diffHours = (dtCurrent.getTime() - trackerMasuk.dt.getTime()) / (1000 * 60 * 60);

            if (diffHours < HR_CONFIG.BATAS_WAKTU.DOUBLE_SCAN) {
                hasil.push([a.nama, a.waktuStr, a.status, "", "", "", "Mengulang (Abaikan)"]);
                warnaBaris(currentColor);
            } 
            else if (diffHours > HR_CONFIG.BATAS_WAKTU.MAX_SHIFT) {
                hasil[trackerMasuk.rowIndex][6] = "LUPA ABSEN KELUAR (> 16 Jam)";
                warna[trackerMasuk.rowIndex] = ["#FFCCCC", "#FFCCCC", "#FFCCCC", "#FFCCCC", "#FFCCCC", "#FFCCCC", "#FFCCCC"];
                trackerMasuk = null; 
                k--; continue;
            } 
            else {
                // ====== CORE MATH ENGINE ======
                var dtMasuk = trackerMasuk.dt;
                var dtKeluar = dtCurrent;
                
                var outTotal = 0, outJk = "", outLembur = "", ket = a.pengecualian;
                var isLemburBebasMasuk = (trackerMasuk.a.pengecualian === "LEMBUR BEBAS");
                var isLemburBebas = (isLemburBebasMasuk || a.pengecualian === "LEMBUR BEBAS");

                if (diffHours < HR_CONFIG.BATAS_WAKTU.MIN_SHIFT) {
                    var menitLemburKasar = diffHours * 60;
                    var menitLemburEfektif = bulatkanKe30Menit(menitLemburKasar);

                    if (menitLemburEfektif === 0) {
                        outLembur = "";
                        outTotal = "";
                        ket = "Tidak Dihitung (Lembur < 15 Menit)" + (ket ? " - " + ket : "");
                    } else {
                        outLembur = menitLemburEfektif / 60;
                        outTotal = outLembur;
                        ket = "Lembur Singkat" + (ket ? " (" + ket + ")" : "");
                    }
                } else {
                    // Aturan A: Jam Masuk Efektif
                    var mDecimal = jamToDecimal(dtMasuk);
                    var baseStart = mDecimal;
                    
                    if (mDecimal >= 5 && mDecimal <= 14 && mDecimal < 8.0) baseStart = 8.0;
                    else if ((mDecimal >= 15 || mDecimal <= 4)) {
                        var nightDecimal = mDecimal < 12 ? mDecimal + 24 : mDecimal;
                        if (nightDecimal < 20.0) baseStart = 20.0;
                        else baseStart = nightDecimal;
                    }

                    // Aturan B: Jam Keluar Efektif
                    var kDecimal = jamToDecimal(dtKeluar);
                    var dayDiff = Math.round((stripTime(dtKeluar) - stripTime(dtMasuk)) / 86400000);
                    kDecimal += dayDiff * 24;

                    var menitKeluarKasar = kDecimal * 60;
                    var menitKeluarEfektif = bulatkanKe30Menit(menitKeluarKasar);
                    var endEffective = menitKeluarEfektif / 60;

                    // Aturan E: Istirahat
                    var potongIstirahat = HR_CONFIG.ISTIRAHAT.NORMAL;
                    if (trackerMasuk.isJum && !trackerMasuk.isLibur && !isLemburBebasMasuk) {
                        potongIstirahat = HR_CONFIG.ISTIRAHAT.JUMAT;
                    }

                    // Aturan C: Kalkulasi Utama
                    var jkKotor = endEffective - baseStart - potongIstirahat;
                    if (jkKotor < 0) jkKotor = 0;

                    outTotal = jkKotor;

                    // Pemisahan JK & Lembur
                    if (trackerMasuk.isLibur || isLemburBebas) {
                        if (isKontrak || isLemburBebas) {
                            outLembur = jkKotor;
                        } else {
                            ket = "Abaikan - Libur (Non-Kontrak)";
                            outTotal = ""; 
                        }
                    } else {
                        if (jkKotor > HR_CONFIG.MAKS_JK) {
                            outJk = HR_CONFIG.MAKS_JK;
                            outLembur = jkKotor - HR_CONFIG.MAKS_JK;
                        } else {
                            outJk = jkKotor;
                        }
                    }
                }

                if (outLembur !== "") totalLemburKaryawan += parseFloat(outLembur);
                if (outTotal !== "") totalHariKaryawan++;

                hasil.push([a.nama, a.waktuStr, a.status, outTotal, outJk, outLembur, ket]);
                warnaBaris(currentColor);

                trackerMasuk = null;
            }
        }
      }

      if (trackerMasuk !== null) {
          hasil[trackerMasuk.rowIndex][6] = "LUPA ABSEN KELUAR (Akhir Data)";
          warna[trackerMasuk.rowIndex] = ["#FFCCCC", "#FFCCCC", "#FFCCCC", "#FFCCCC", "#FFCCCC", "#FFCCCC", "#FFCCCC"];
      }

      var teksHari = totalHariKaryawan > 0 ? totalHariKaryawan + " hari" : "";
      var totalAkhirLembur = totalLemburKaryawan > 0 ? Math.round(totalLemburKaryawan * 100) / 100 : "";
      
      hasil.push(["", "", "", teksHari, "", totalAkhirLembur, "TOTAL AKUMULASI"]);
      warnaBaris("#E2EFDA"); 
      
      hasil.push(["", "", "", "", "", "", ""]); warnaBaris("#FFFFFF");
      hasil.push(["", "", "", "", "", "", ""]); warnaBaris("#FFFFFF");
    }

    var fileBaruId = simpanDanWarnai(hasil, warna);
    var linkDrive = "https://docs.google.com/spreadsheets/d/" + fileBaruId + "/edit";
    var linkDownload = "https://docs.google.com/spreadsheets/d/" + fileBaruId + "/export?format=xlsx";

    return { status: 'success', driveUrl: linkDrive, downloadUrl: linkDownload };
  } catch (error) {
    return { status: 'error', message: error.toString() };
  }
}

// ==========================================
// 🎨 WRITER: MENYIMPAN, MEWARNAI & MEMBUAT LEGENDA
// ==========================================
function simpanDanWarnai(values, backgrounds) {
  var namaFile = "Laporan Rekap & Payroll - " + Utilities.formatDate(new Date(), "Asia/Jakarta", "dd-MM-yyyy HH:mm");
  var ss = SpreadsheetApp.create(namaFile);
  var sheet = ss.getActiveSheet();
  
  var range = sheet.getRange(1, 1, values.length, values[0].length);
  range.setValues(values);
  range.setBackgrounds(backgrounds); 

  range.setFontFamily("Arial").setVerticalAlignment("middle");
  sheet.getRange(1, 1, values.length, 3).setHorizontalAlignment("left");
  sheet.getRange(1, 4, values.length, 4).setHorizontalAlignment("center");
  sheet.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#3B3838").setFontColor("#FFFFFF");
  
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(7, 250);
  
  var legendRow = 2;
  var legendColText = 9;   
  var legendColColor = 10; 

  var legends = [
    { text: "Normal (Hari Kerja)", color: "#FFFFFF" },
    { text: "Jumat (Istirahat 1.5 Jam)", color: "#FFFF00" },
    { text: "Sabtu/Minggu/Tgl Merah", color: "#FFC000" },
    { text: "Error / Invalid Absen", color: "#FFCCCC" },
    { text: "Total Akumulasi", color: "#E2EFDA" },
    { text: "Pemisah Karyawan", color: "#E7E6E6" }
  ];

  sheet.getRange(legendRow, legendColText, 1, 2).merge()
       .setValue("LEGENDA WARNA")
       .setFontWeight("bold")
       .setHorizontalAlignment("center")
       .setBackground("#3B3838")
       .setFontColor("#FFFFFF")
       .setBorder(true, true, true, true, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID);

  for (var i = 0; i < legends.length; i++) {
    var currentRow = legendRow + 1 + i;
    sheet.getRange(currentRow, legendColText)
         .setValue(legends[i].text)
         .setFontSize(10)
         .setVerticalAlignment("middle");
         
    sheet.getRange(currentRow, legendColColor)
         .setBackground(legends[i].color)
         .setBorder(true, true, true, true, null, null, "#CCCCCC", SpreadsheetApp.BorderStyle.SOLID);
  }

  sheet.setColumnWidth(legendColText, 160);
  sheet.setColumnWidth(legendColColor, 40);

  return ss.getId();
}
