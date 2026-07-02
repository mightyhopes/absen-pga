function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Audit Engine - PT. Digiprint')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ==========================================
// ⚙️ KONFIGURASI AUDIT DIGIPRINT
// ==========================================
var HR_CONFIG = {
    ISTIRAHAT: { NORMAL: 1.0, JUMAT: 1.5 },
    BATAS_WAKTU: { DOUBLE_SCAN: 0.08, MAX_SHIFT: 16.0 },
    MAKS_JK: 8,
    MAKS_LEMBUR: 3.0 // Aturan ketat maksimal lembur 3 Jam
};

// ==========================================
// 🧠 HELPER FORMAT WAKTU (Mendukung AM/PM)
// ==========================================
function parseWaktuDigiprint(waktuStr) {
    waktuStr = waktuStr.trim();
    if (waktuStr.toUpperCase().match(/[AP]M/)) {
        var parts = waktuStr.split(' ');
        var dateParts = parts[0].split('/'); 
        var timeParts = parts[1].split(':'); 
        
        var month = parseInt(dateParts[0], 10) - 1;
        var day = parseInt(dateParts[1], 10);
        var year = parseInt(dateParts[2], 10);
        
        var hours = parseInt(timeParts[0], 10);
        var mins = parseInt(timeParts[1], 10);
        var ampm = parts[2].toUpperCase();
        
        if (ampm === "PM" && hours < 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;
        
        return new Date(year, month, day, hours, mins);
    } else {
        var parts = waktuStr.split(' ');
        var tglParts = parts[0].split('/');
        var jamParts = (parts.length > 1 ? parts[1] : "00.00").split(/[:.]/);
        return new Date(tglParts[2], tglParts[1] - 1, tglParts[0], jamParts[0], jamParts[1]);
    }
}

function formatTglStr(d) {
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yyyy = d.getFullYear();
    return dd + "/" + mm + "/" + yyyy;
}

function jamToDecimal(dateObj) { return dateObj.getHours() + (dateObj.getMinutes() / 60); }
function stripTime(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }

function formatDesimal(val) {
    if (val === "" || isNaN(val)) return val;
    return Math.round(val * 100) / 100;
}

function roundMasuk(menitAktual) {
    var m = Math.round(menitAktual) % 60;
    var h = Math.floor(Math.round(menitAktual) / 60);
    if (m <= 15) m = 0; else if (m <= 45) m = 30; else { m = 0; h += 1; }    
    return (h * 60) + m;
}

function roundKeluar(menitAktual) {
    var m = Math.round(menitAktual) % 60;
    var h = Math.floor(Math.round(menitAktual) / 60);
    if (m <= 15) m = 0; else if (m <= 45) m = 30; else { m = 0; h += 1; }    
    return (h * 60) + m;
}

// ==========================================
// 🚀 MAIN ENGINE AUDIT DIGIPRINT
// ==========================================
function prosesDataAbsensiServer(dataArray, kalenderLibur) {
  try {
    var hasil = [];
    var warna = []; 
    var dataPerNama = {};
    var urutanNama = [];

    // 1. Parsing Kalender Libur dari UI
    var cacheLibur = {}; 
    if (kalenderLibur && kalenderLibur.length > 0) {
        for (var i = 0; i < kalenderLibur.length; i++) {
            if (kalenderLibur[i].aktif) cacheLibur[kalenderLibur[i].tanggal] = true;
        }
    }

    // 2. AMBIL MASTER NAMA DARI DATABASE (BERDASARKAN ID)
    var idSheetDatabase = '1yW8W1qYOhZ2ZFA2LgYEAJ8Q12bQ-OTHlXqCpQXEStCQ';
    var ssData = SpreadsheetApp.openById(idSheetDatabase);
    var sheetDigi = ssData.getSheetByName("digi");
    var karyawanDigi = {}; // Simpan dalam format Objek { "1": "ANANDA", "2": "ANANDA" }
    
    if (sheetDigi) {
        var dataDigi = sheetDigi.getRange("A2:B200").getValues(); // Mengambil Kolom A (ID) dan B (Nama)
        for(var r=0; r < dataDigi.length; r++) {
            if(dataDigi[r][0]) {
                var idKar = String(dataDigi[r][0]).trim();
                var namaKar = String(dataDigi[r][1]).trim().toUpperCase();
                karyawanDigi[idKar] = namaKar;
            }
        }
    }

    // 3. Baca Kolom Sesuai Excel Digiprint (No ID | Nama | Waktu | Status | Pengecualian)
    for (var i = 1; i < dataArray.length; i++) {
        var row = dataArray[i];
        if (!row || row.length < 4 || !row[0] || !row[1]) continue; 
        
        var idMesin = String(row[0]).trim();
        var namaMesin = String(row[1]).trim().toUpperCase(); 
        
        // FILTER DATABASE: Cek berdasarkan ID (Kolom A)
        if (Object.keys(karyawanDigi).length > 0 && !karyawanDigi[idMesin]) {
            continue; 
        }

        var waktuStr = String(row[2]).trim();           
        var status = String(row[3]).trim().toUpperCase(); 
        var pengecualian = row.length > 4 && row[4] ? String(row[4]).trim().toUpperCase() : "";

        if (!waktuStr) continue;

        // Gunakan Composite Key agar nama duplikat terpisah
        var compositeKey = idMesin + " - " + namaMesin;
        if (!dataPerNama[compositeKey]) { dataPerNama[compositeKey] = []; urutanNama.push(compositeKey); }
        dataPerNama[compositeKey].push({nama: namaMesin, waktuStr: waktuStr, status: status, pengecualian: pengecualian});
    }

    function warnaBaris(hex) { warna.push([hex, hex, hex, hex, hex, hex, hex]); }

    // 4. Eksekusi Logika Per Karyawan
    urutanNama.forEach(function(compositeKey) {
        var absenKaryawan = dataPerNama[compositeKey];
        var namaKaryawan = absenKaryawan[0].nama; // Mengambil nama asli untuk baris data
        
        absenKaryawan.sort(function(a,b){
            return parseWaktuDigiprint(a.waktuStr).getTime() - parseWaktuDigiprint(b.waktuStr).getTime();
        });

        // Header tabel menggunakan compositeKey (Cth: 1 - ANANDA ARDIAN VIERY)
        hasil.push([compositeKey, "Waktu", "Status", "Jam Kerja Total", "JK", "Lembur", "Keterangan"]);
        warnaBaris("#3B3838");

        var totalLembur = 0;
        var totalHari = 0;
        var trackerMasuk = null;
        var prevEvent = null;
        var hariTercatatNormal = {};
        var hariTercatatKerja = {};

        // === FUNGSI INTERNAL: AUTO-HEAL LUPA ABSEN PULANG ===
        function autoHealPulang(tracker) {
            var dtIn = tracker.dt;
            var isJumLama = tracker.isJum;
            var potongIstirahatLama = isJumLama ? HR_CONFIG.ISTIRAHAT.JUMAT : HR_CONFIG.ISTIRAHAT.NORMAL;
            
            var baseStartLama = roundMasuk(jamToDecimal(dtIn) * 60) / 60;
            var fakeEndDecimal = baseStartLama + potongIstirahatLama + HR_CONFIG.MAKS_JK; 
            
            var hOutFake = Math.floor(fakeEndDecimal);
            var mOutFake = Math.round((fakeEndDecimal - hOutFake) * 60) + Math.floor(Math.random() * 6); 
            if(mOutFake >= 60) { hOutFake++; mOutFake -= 60; }
            
            var daysAdd = Math.floor(hOutFake / 24);
            hOutFake = hOutFake % 24;

            var fakeKeluarDate = new Date(dtIn.getFullYear(), dtIn.getMonth(), dtIn.getDate() + daysAdd, hOutFake, mOutFake);
            var strOutFake = formatTglStr(fakeKeluarDate) + " " + String(hOutFake).padStart(2,'0') + "." + String(mOutFake).padStart(2,'0');

            var colorLama = isJumLama ? "#FFFF00" : "#FFFFFF";
            
            // Sertakan infoKet jika itu adalah lanjutan shift
            var ketOut = tracker.isLanjutan ? "Lanjutan Shift Bulan Sebelumnya" : "OK";
            
            hasil.push([namaKaryawan, strOutFake, "C/KELUAR", 8, 8, "", ketOut]);
            warnaBaris(colorLama);

            var tglMasukAsli = formatTglStr(dtIn);
            if (!hariTercatatKerja[tglMasukAsli]) {
                totalHari++;
                hariTercatatKerja[tglMasukAsli] = true;
            }
        }

        absenKaryawan.forEach(function(a, k) {
            var dtCurrent = parseWaktuDigiprint(a.waktuStr);
            var tglCekStr = formatTglStr(dtCurrent); 
            var dayIndex = dtCurrent.getDay();
            var isHariLibur = (dayIndex === 0 || dayIndex === 6 || cacheLibur[tglCekStr]);

            if (isHariLibur) return; 

            var isJumat = (dayIndex === 5);
            var currentColor = isJumat ? "#FFFF00" : "#FFFFFF";

            if (prevEvent !== null && a.status === prevEvent.status) {
                var gapDuplikat = (dtCurrent.getTime() - prevEvent.dt.getTime()) / 3600000;
                if (gapDuplikat < 1.0) return; 
            }
            prevEvent = { dt: dtCurrent, status: a.status };

            var isMasukStr = a.status.includes("MASUK");

            // =======================================================
            // BLOK 1: TRACKER KOSONG (MENCARI PASANGAN BARU)
            // =======================================================
            if (trackerMasuk === null) {
                if (isMasukStr) {
                    var dtMasukNormal = new Date(dtCurrent.getTime());
                    var hAct = dtCurrent.getHours();
                    if (hAct >= 5 && hAct <= 11) {
                        var randMin = Math.floor(Math.random() * 15) + 46; 
                        var hIn = 7;
                        if (randMin >= 60) { hIn = 8; randMin -= 60; }
                        dtMasukNormal.setHours(hIn, randMin, 0, 0);
                    }
                    trackerMasuk = { dt: dtMasukNormal, a: a, rowIndex: hasil.length, isJum: isJumat, isLanjutan: false };
                    
                    var hInFormat = dtMasukNormal.getHours();
                    var mInFormat = dtMasukNormal.getMinutes();
                    var strInDisplay = formatTglStr(dtMasukNormal) + " " + String(hInFormat).padStart(2,'0') + "." + String(mInFormat).padStart(2,'0');
                    
                    hasil.push([namaKaryawan, strInDisplay, "C/MASUK", "", "", "", "OK"]);
                    warnaBaris(currentColor);
                } 
                else {
                    // AUTO-HEAL: ORPHAN KELUAR 
                    var hOut = dtCurrent.getHours();
                    var dtFakeIn = new Date(dtCurrent.getTime());
                    
                    if (hOut <= 12) {
                        dtFakeIn.setDate(dtFakeIn.getDate() - 1);
                        dtFakeIn.setHours(20, 0, 0, 0);
                    } else {
                        var randMin = Math.floor(Math.random() * 15) + 46; 
                        var hIn = 7;
                        if (randMin >= 60) { hIn = 8; randMin -= 60; }
                        dtFakeIn.setHours(hIn, randMin, 0, 0);
                    }
                    
                    var tglFakeInStr = formatTglStr(dtFakeIn);
                    var dayFake = dtFakeIn.getDay();
                    
                    if (dayFake === 0 || dayFake === 6 || cacheLibur[tglFakeInStr]) {
                        return; 
                    }

                    var isJumFake = (dayFake === 5);
                    var isLintasBulan = (dtFakeIn.getMonth() !== dtCurrent.getMonth());
                    var ketFakeIn = isLintasBulan ? "Lanjutan Shift Bulan Sebelumnya" : "OK";

                    trackerMasuk = { dt: dtFakeIn, a: a, rowIndex: hasil.length, isJum: isJumFake, isLanjutan: isLintasBulan };
                    
                    var strInDisplay = tglFakeInStr + " " + String(dtFakeIn.getHours()).padStart(2,'0') + "." + String(dtFakeIn.getMinutes()).padStart(2,'0');
                    var colorFake = isJumFake ? "#FFFF00" : "#FFFFFF";
                    
                    hasil.push([namaKaryawan, strInDisplay, "C/MASUK", "", "", "", ketFakeIn]);
                    warnaBaris(colorFake);
                }
            } 
            
            // =======================================================
            // BLOK 2: TRACKER TERISI (MENGHITUNG PASANGAN KELUAR)
            // =======================================================
            if (trackerMasuk !== null && !isMasukStr) {
                var dtMasuk = trackerMasuk.dt;
                var dtKeluar = dtCurrent;
                var diffHours = (dtKeluar.getTime() - dtMasuk.getTime()) / 3600000;
                var tglMasukAsli = formatTglStr(dtMasuk);

                if (diffHours < HR_CONFIG.BATAS_WAKTU.DOUBLE_SCAN) {
                    return; 
                } 
                else if (diffHours > HR_CONFIG.BATAS_WAKTU.MAX_SHIFT) {
                    autoHealPulang(trackerMasuk);
                    trackerMasuk = null;
                    
                    var hOutNew = dtCurrent.getHours();
                    var dtFakeInNew = new Date(dtCurrent.getTime());
                    if (hOutNew <= 12) { dtFakeInNew.setDate(dtFakeInNew.getDate() - 1); dtFakeInNew.setHours(20, 0, 0, 0); } 
                    else { 
                        var randMinNew = Math.floor(Math.random() * 15) + 46; 
                        var hInNew = 7; if (randMinNew >= 60) { hInNew = 8; randMinNew -= 60; }
                        dtFakeInNew.setHours(hInNew, randMinNew, 0, 0); 
                    }
                    
                    var tglFakeInStrNew = formatTglStr(dtFakeInNew);
                    var dayFakeNew = dtFakeInNew.getDay();
                    
                    if (dayFakeNew !== 0 && dayFakeNew !== 6 && !cacheLibur[tglFakeInStrNew]) {
                        var isJumFakeNew = (dayFakeNew === 5);
                        var isLintasBulanNew = (dtFakeInNew.getMonth() !== dtCurrent.getMonth());
                        var ketFakeInNew = isLintasBulanNew ? "Lanjutan Shift Bulan Sebelumnya" : "OK";

                        trackerMasuk = { dt: dtFakeInNew, a: a, rowIndex: hasil.length, isJum: isJumFakeNew, isLanjutan: isLintasBulanNew };
                        var strInDisplayNew = tglFakeInStrNew + " " + String(dtFakeInNew.getHours()).padStart(2,'0') + "." + String(dtFakeInNew.getMinutes()).padStart(2,'0');
                        hasil.push([namaKaryawan, strInDisplayNew, "C/MASUK", "", "", "", ketFakeInNew]);
                        warnaBaris(isJumFakeNew ? "#FFFF00" : "#FFFFFF");
                        
                        dtMasuk = trackerMasuk.dt; 
                    } else {
                        return; 
                    }
                }

                // ====== LOGIKA NORMALISASI LEMBUR DIGIPRINT ======
                var mDecimalKasar = jamToDecimal(dtMasuk);
                var baseStart = roundMasuk(mDecimalKasar * 60) / 60;
                
                var kDecimalKasar = jamToDecimal(dtKeluar);
                var dayDiff = Math.round((stripTime(dtKeluar) - stripTime(dtMasuk)) / 86400000);
                kDecimalKasar += dayDiff * 24;
                var endEffective = roundKeluar(kDecimalKasar * 60) / 60;

                var durasiKotor = endEffective - baseStart;
                var potongIstirahat = trackerMasuk.isJum ? HR_CONFIG.ISTIRAHAT.JUMAT : HR_CONFIG.ISTIRAHAT.NORMAL;
                var maxLemburHariIni = trackerMasuk.isJum ? 2.5 : HR_CONFIG.MAKS_LEMBUR;
                
                var outJk = 0;
                var outLembur = 0;
                var isCapped = false;
                var newEndDecimal = endEffective;

                var isNightStart = (baseStart >= 18.0 || baseStart <= 4.0);

                if (durasiKotor >= 5.0) {
                    hariTercatatNormal[tglMasukAsli] = true;
                    var jkKotor = durasiKotor - potongIstirahat;
                    if (jkKotor < 0) jkKotor = 0;

                    if (jkKotor > HR_CONFIG.MAKS_JK) {
                        outJk = HR_CONFIG.MAKS_JK;
                        var lemburKotor = jkKotor - HR_CONFIG.MAKS_JK;
                        if (lemburKotor > maxLemburHariIni) {
                            outLembur = maxLemburHariIni;
                            isCapped = true;
                            newEndDecimal = baseStart + potongIstirahat + HR_CONFIG.MAKS_JK + maxLemburHariIni;
                        } else {
                            outLembur = lemburKotor;
                        }
                    } else {
                        outJk = jkKotor;
                        outLembur = 0;
                    }
                } else {
                    if (hariTercatatNormal[tglMasukAsli] || isNightStart) {
                        var lemburKotor = durasiKotor;
                        if (lemburKotor > maxLemburHariIni) {
                            outLembur = maxLemburHariIni;
                            isCapped = true;
                            newEndDecimal = baseStart + maxLemburHariIni;
                        } else {
                            outLembur = lemburKotor;
                        }
                    } else {
                        outJk = durasiKotor;
                        outLembur = 0;
                    }
                }

                var strOut = "";
                if (isCapped) {
                    var hOutCapped = Math.floor(newEndDecimal);
                    var mOutCapped = Math.round((newEndDecimal - hOutCapped) * 60);
                    
                    mOutCapped += Math.floor(Math.random() * 6);
                    if (mOutCapped >= 60) { hOutCapped += 1; mOutCapped -= 60; }
                    
                    var daysAdd = Math.floor(hOutCapped / 24);
                    hOutCapped = hOutCapped % 24;

                    var newKeluarDate = new Date(dtMasuk.getFullYear(), dtMasuk.getMonth(), dtMasuk.getDate() + daysAdd, hOutCapped, mOutCapped);
                    strOut = formatTglStr(newKeluarDate) + " " + String(hOutCapped).padStart(2,'0') + "." + String(mOutCapped).padStart(2,'0');
                } else {
                    var hOut = dtKeluar.getHours();
                    var mOut = dtKeluar.getMinutes();
                    strOut = formatTglStr(dtKeluar) + " " + String(hOut).padStart(2,'0') + "." + String(mOut).padStart(2,'0');
                }

                var totalJam = formatDesimal(outJk + outLembur);
                outJk = formatDesimal(outJk);
                outLembur = formatDesimal(outLembur);

                var infoKet = trackerMasuk.isLanjutan ? "Lanjutan Shift Bulan Sebelumnya" : "OK";

                hasil.push([namaKaryawan, strOut, "C/KELUAR", totalJam, outJk || "", outLembur || "", infoKet]);
                warnaBaris(currentColor);

                if ((outJk > 0 || outLembur > 0) && !hariTercatatKerja[tglMasukAsli]) {
                    totalHari++;
                    hariTercatatKerja[tglMasukAsli] = true;
                }
                if (outLembur > 0) totalLembur += parseFloat(outLembur);

                trackerMasuk = null;
            }
        });

        if (trackerMasuk !== null) {
            autoHealPulang(trackerMasuk);
        }

        hasil.push(["", "", "", totalHari + " hari", "", formatDesimal(totalLembur) || "", "TOTAL AKUMULASI"]);
        warnaBaris("#E2EFDA");
        hasil.push(["", "", "", "", "", "", ""]); warnaBaris("#FFFFFF");
        hasil.push(["", "", "", "", "", "", ""]); warnaBaris("#FFFFFF");
    });

    var hasilSimpan = simpanDanWarnai(hasil, warna);
    var linkDrive = "https://docs.google.com/spreadsheets/d/" + hasilSimpan.fileId + "/edit";
    var linkDownload = "https://docs.google.com/spreadsheets/d/" + hasilSimpan.fileId + "/export?format=xlsx";
    var linkFolder = "https://drive.google.com/drive/folders/" + hasilSimpan.folderId;

    return { status: 'success', driveUrl: linkDrive, downloadUrl: linkDownload, folderUrl: linkFolder };
  } catch (error) {
    return { status: 'error', message: error.toString() };
  }
}

// ==========================================
// 🎨 WRITER: MENYIMPAN, MEWARNAI & MEMBUAT LEGENDA
// ==========================================
function simpanDanWarnai(values, backgrounds) {
  var namaFile = "Laporan Audit Digiprint - " + Utilities.formatDate(new Date(), "Asia/Jakarta", "dd-MM-yyyy HH:mm");
  var ss = SpreadsheetApp.create(namaFile);
  var sheet = ss.getActiveSheet();
  
  var range = sheet.getRange(1, 1, values.length, values[0].length);
  range.setValues(values);
  range.setBackgrounds(backgrounds); 
  
  range.setFontFamily("Arial").setVerticalAlignment("middle");
  sheet.getRange(1, 1, values.length, 3).setHorizontalAlignment("left");
  sheet.getRange(1, 4, values.length, 4).setHorizontalAlignment("center");
  
  var blockStart = -1;
  for (var i = 0; i < values.length; i++) {
      var isEmptyRow = (values[i].join("") === "");
      if (!isEmptyRow) {
          if (blockStart === -1) {
              blockStart = i + 1;
              sheet.getRange(blockStart, 1, 1, 7).setFontWeight("bold").setFontColor("#FFFFFF");
          }
      } else {
          if (blockStart !== -1) {
              var numRows = i - blockStart + 1;
              sheet.getRange(blockStart, 1, numRows, 7).setBorder(true, true, true, true, true, true, "#000000", SpreadsheetApp.BorderStyle.SOLID);
              sheet.getRange(i, 1, 1, 7).setFontWeight("bold");
              blockStart = -1;
          }
      }
  }
  if (blockStart !== -1) {
      var numRows = values.length - blockStart + 1;
      sheet.getRange(blockStart, 1, numRows, 7).setBorder(true, true, true, true, true, true, "#000000", SpreadsheetApp.BorderStyle.SOLID);
      sheet.getRange(values.length, 1, 1, 7).setFontWeight("bold");
  }
  
  sheet.setColumnWidth(1, 250); 
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(7, 270);
  
  var legendRow = 2;
  var legendColText = 9;   
  var legendColColor = 10; 

  var legends = [
    { text: "Kerja Normal (Sen - Kam)", color: "#FFFFFF" },
    { text: "Kerja Jumat (Istirahat 1.5)", color: "#FFFF00" },
    { text: "Total Akumulasi", color: "#E2EFDA" } 
  ];

  sheet.getRange(legendRow, legendColText, 1, 2).merge()
       .setValue("LEGENDA WARNA")
       .setFontWeight("bold")
       .setHorizontalAlignment("center")
       .setBackground("#3B3838")
       .setFontColor("#FFFFFF")
       .setBorder(true, true, true, true, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID);

  for (var j = 0; j < legends.length; j++) {
    var currentRow = legendRow + 1 + j;
    sheet.getRange(currentRow, legendColText)
         .setValue(legends[j].text)
         .setFontSize(10)
         .setVerticalAlignment("middle");
         
    sheet.getRange(currentRow, legendColColor)
         .setBackground(legends[j].color)
         .setBorder(true, true, true, true, null, null, "#CCCCCC", SpreadsheetApp.BorderStyle.SOLID);
  }

  sheet.setColumnWidth(legendColText, 160);
  sheet.setColumnWidth(legendColColor, 40);

  var fileId = ss.getId();
  var driveFile = DriveApp.getFileById(fileId);
  driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Pindahkan file ke folder khusus agar Drive tidak berantakan
  var namaFolder = "Laporan Audit Digiprint";
  var folders = DriveApp.getFoldersByName(namaFolder);
  var folder;
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(namaFolder);
  }
  // Set folder ke Anyone with Link = Editor
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
  folder.addFile(driveFile);
  DriveApp.getRootFolder().removeFile(driveFile);

  return { fileId: fileId, folderId: folder.getId() };
}

// ==========================================
// 🔐 FUNGSI PANCINGAN OTORISASI (JALANKAN MANUAL SEKALI)
// ==========================================
function OTORISASI_SISTEM() {
  // Fungsi ini sengaja dibuat agar Google memunculkan popup permintaan akses Drive.
  // Silakan pilih fungsi ini di dropdown atas, lalu klik RUN.
  var pancingan = DriveApp.createFile("BukaGembok", "123", MimeType.PLAIN_TEXT);
  pancingan.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  pancingan.setTrashed(true);
  Logger.log("Otorisasi Google Drive Berhasil Diberikan!");
}
