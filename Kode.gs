function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('HR Portal - PT. Perfect Garmen Accessories')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ==========================================
// ⚙️ KONFIGURASI HR & PAYROLL 
// ==========================================
var HR_CONFIG = {
    ISTIRAHAT: { NORMAL: 1.0, JUMAT: 1.5 },
    BATAS_WAKTU: {
        DOUBLE_SCAN: 0.08, 
        DUPLIKAT_STATUS: 1.0, 
        MIN_SHIFT: 4.0,    
        MAX_SHIFT: 16.0    
    },
    MAKS_JK: 8 
};

// ==========================================
// 🧠 HELPER SHARED UTILITY
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

function roundMasuk(menitAktual) {
    var m = Math.round(menitAktual) % 60;
    var h = Math.floor(Math.round(menitAktual) / 60);
    if (m <= 15) m = 0;        
    else if (m <= 45) m = 30;  
    else { m = 0; h += 1; }    
    return (h * 60) + m;
}

function roundKeluar(menitAktual) {
    var m = Math.round(menitAktual) % 60;
    var h = Math.floor(Math.round(menitAktual) / 60);
    if (m <= 15) m = 0;        
    else if (m <= 45) m = 30;  
    else { m = 0; h += 1; }    
    return (h * 60) + m;
}

function formatDesimal(val) {
    if (val === "" || isNaN(val)) return val;
    return Math.round(val * 100) / 100;
}

// ==========================================
// 🚀 MAIN SWITCHER ROUTER
// ==========================================
function prosesDataAbsensiServer(dataArray, kalenderLibur, mode) {
  try {
      if (mode === 'AUDIT') {
          return prosesAudit(dataArray, kalenderLibur);
      } else {
          return prosesPayroll(dataArray, kalenderLibur);
      }
  } catch (error) {
      return { status: 'error', message: error.toString() };
  }
}

// ==========================================
// 🛡️ ENGINE 1: PAYROLL (EXISTING - TIDAK DIUBAH)
// ==========================================
function prosesPayroll(dataArray, kalenderLibur) {
    var hasil = [];
    var warna = []; 
    var dataPerNama = {};
    var urutanNama = [];

    var idSheetDatabase = '1sYQ6CQK8JAWEfUXxzf6OkdsTDcfHzRiOA_fOpxXWTyI';
    var ssData = SpreadsheetApp.openById(idSheetDatabase);
    
    var sheetKK = ssData.getSheetByName("KK");
    var KARYAWAN_KONTRAK = [];
    if(sheetKK) {
        var dataKK = sheetKK.getRange("B2:B100").getValues();
        for(var r=0; r<dataKK.length; r++) {
            if(dataKK[r][0]) KARYAWAN_KONTRAK.push(String(dataKK[r][0]).trim().toUpperCase());
        }
    }

    var sheetHL = ssData.getSheetByName("HL");
    var KARYAWAN_HL = [];
    if(sheetHL) {
        var dataHL = sheetHL.getRange("B2:B100").getValues();
        for(var r=0; r<dataHL.length; r++) {
            if(dataHL[r][0]) KARYAWAN_HL.push(String(dataHL[r][0]).trim().toUpperCase());
        }
    }

    var cacheLibur = {}; 
    if (kalenderLibur && kalenderLibur.length > 0) {
        for (var i = 0; i < kalenderLibur.length; i++) {
            if (kalenderLibur[i].aktif) {
                cacheLibur[kalenderLibur[i].tanggal] = true;
            }
        }
    }

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

    for (var n = 0; n < urutanNama.length; n++) {
      var namaKaryawan = urutanNama[n];
      var absenKaryawan = dataPerNama[namaKaryawan];
      
      var isKK = (KARYAWAN_KONTRAK.indexOf(namaKaryawan.toUpperCase()) !== -1);
      var isHL = (KARYAWAN_HL.indexOf(namaKaryawan.toUpperCase()) !== -1);
      var tipeString = isKK ? "KK" : (isHL ? "HL" : "Unknown->HL");

      hasil.push([namaKaryawan + " (" + tipeString + ")", "Waktu", "Status", "Jam Kerja Total", "JK", "Lembur", "Keterangan"]);
      warnaBaris("#3B3838");

      var totalLemburKaryawan = 0;
      var totalHariKaryawan = 0; 
      var trackerMasuk = null; 
      var prevEvent = null;
      var hariTercatatNormal = {}; 

      for (var k = 0; k < absenKaryawan.length; k++) {
        var a = absenKaryawan[k];
        var dtCurrent = parseWaktu(a.waktuStr);
        var tglCekStr = a.waktuStr.split(' ')[0];
        var dayIndex = dtCurrent.getDay();
        
        var isHariLibur = cacheLibur[tglCekStr] || false; 
        var isJumat = (dayIndex === 5);
        
        var currentColor = "#FFFFFF"; 
        if (isHariLibur) currentColor = "#FFC000"; 
        else if (isJumat) currentColor = "#FFFF00"; 

        if (prevEvent !== null && a.status === prevEvent.status) {
            var gapDuplikat = (dtCurrent.getTime() - prevEvent.dt.getTime()) / (1000 * 60 * 60);
            if (gapDuplikat >= 0 && gapDuplikat < HR_CONFIG.BATAS_WAKTU.DUPLIKAT_STATUS) {
                hasil.push([a.nama, a.waktuStr, a.status, "", "", "", "Mengulang - Diabaikan"]);
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
                if (k === 0) keteranganError = "Abaikan - Lanjutan Shift Bulan Sebelumnya";
                hasil.push([a.nama, a.waktuStr, a.status, "", "", "", keteranganError]);
                warnaBaris("#FFCCCC"); 
            }
        } else {
            var diffHours = (dtCurrent.getTime() - trackerMasuk.dt.getTime()) / (1000 * 60 * 60);
            var tglMasukAsli = trackerMasuk.a.waktuStr.split(' ')[0];

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
                var dtMasuk = trackerMasuk.dt;
                var dtKeluar = dtCurrent;
                var outTotal = "", outJk = "", outLembur = "";
                var baseKet = a.pengecualian ? a.pengecualian + " | " : "";
                var ket = "";

                if (diffHours < HR_CONFIG.BATAS_WAKTU.MIN_SHIFT) {
                    var menitLemburKasar = diffHours * 60;
                    var menitLemburEfektif = roundKeluar(menitLemburKasar); 

                    if (menitLemburEfektif === 0) {
                        ket = baseKet + "Tidak Dihitung (< 15 Menit)";
                    } else {
                        var jamEfektif = menitLemburEfektif / 60;
                        var mDecimalKasar = jamToDecimal(dtMasuk);
                        var isRandomStart = false;
                        if ((mDecimalKasar >= 9.0 && mDecimalKasar <= 18.0) || (mDecimalKasar >= 21.0 || mDecimalKasar <= 4.0)) {
                            isRandomStart = true;
                        }

                        if (trackerMasuk.isLibur || hariTercatatNormal[tglMasukAsli] || isRandomStart) {
                            if (isKK) {
                                outLembur = jamEfektif;
                                outTotal = jamEfektif;
                                ket = baseKet + "Lembur Singkat";
                            } else {
                                outJk = jamEfektif;
                                outTotal = jamEfektif;
                                ket = baseKet + "Kerja Singkat (HL)";
                            }
                        } else {
                            if (isKK) {
                                outTotal = ""; outJk = 0; outLembur = 0;
                                ket = baseKet + "Izin (Kerja < 4 Jam)";
                            } else {
                                outJk = jamEfektif;
                                outTotal = jamEfektif;
                                ket = baseKet + "Kerja Singkat (HL)";
                            }
                        }
                    }
                } 
                else {
                    hariTercatatNormal[tglMasukAsli] = true; 

                    var mDecimalKasar = jamToDecimal(dtMasuk);
                    var baseStart = roundMasuk(mDecimalKasar * 60) / 60;
                    
                    if (baseStart >= 5 && baseStart <= 14 && baseStart < 8.0) baseStart = 8.0;
                    else if (baseStart >= 15 || baseStart <= 4) {
                        var nightDecimal = baseStart < 12 ? baseStart + 24 : baseStart;
                        if (nightDecimal < 20.0) baseStart = 20.0;
                        else baseStart = nightDecimal;
                    }

                    var kDecimalKasar = jamToDecimal(dtKeluar);
                    var dayDiff = Math.round((stripTime(dtKeluar) - stripTime(dtMasuk)) / 86400000);
                    kDecimalKasar += dayDiff * 24;
                    
                    var endEffective = roundKeluar(kDecimalKasar * 60) / 60;

                    var potongIstirahat = HR_CONFIG.ISTIRAHAT.NORMAL;
                    if (trackerMasuk.isJum && !trackerMasuk.isLibur) {
                        potongIstirahat = HR_CONFIG.ISTIRAHAT.JUMAT;
                    }

                    var jkKotor = endEffective - baseStart - potongIstirahat;
                    if (jkKotor < 0) jkKotor = 0;

                    if (isKK && jkKotor < 4 && !trackerMasuk.isLibur) {
                        outTotal = ""; outJk = 0; outLembur = 0;
                        ket = baseKet + "Izin (Kerja < 4 Jam Bersih)";
                    } 
                    else {
                        outTotal = jkKotor;
                        if (trackerMasuk.isLibur && isKK) {
                            outLembur = jkKotor;
                            outJk = "";
                        } 
                        else {
                            if (jkKotor > HR_CONFIG.MAKS_JK) {
                                outJk = HR_CONFIG.MAKS_JK;
                                outLembur = jkKotor - HR_CONFIG.MAKS_JK;
                            } else {
                                outJk = jkKotor;
                            }
                        }
                        ket = baseKet + "Hadir";
                    }
                }

                if (!ket && baseKet) ket = a.pengecualian; 
                outTotal = formatDesimal(outTotal);
                outJk = formatDesimal(outJk);
                outLembur = formatDesimal(outLembur);

                if (outLembur !== "" && outLembur > 0) totalLemburKaryawan += parseFloat(outLembur);
                if (outTotal !== "" && outTotal > 0) totalHariKaryawan++;

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

      var teksHari = totalHariKaryawan > 0 ? totalHariKaryawan + " hari" : "0 hari";
      var totalAkhirLembur = totalLemburKaryawan > 0 ? formatDesimal(totalLemburKaryawan) : "";
      
      hasil.push(["", "", "", teksHari, "", totalAkhirLembur, "TOTAL AKUMULASI"]);
      warnaBaris("#E2EFDA"); 
      hasil.push(["", "", "", "", "", "", ""]); warnaBaris("#FFFFFF");
      hasil.push(["", "", "", "", "", "", ""]); warnaBaris("#FFFFFF");
    }

    var fileBaruId = simpanDanWarnai(hasil, warna, 'PAYROLL');
    var linkDrive = "https://docs.google.com/spreadsheets/d/" + fileBaruId + "/edit";
    var linkDownload = "https://docs.google.com/spreadsheets/d/" + fileBaruId + "/export?format=xlsx";

    return { status: 'success', driveUrl: linkDrive, downloadUrl: linkDownload };
}

// ==========================================
// 🕵️‍♂️ ENGINE 2: AUDIT (ENGINE BARU)
// ==========================================
function prosesAudit(dataArray, kalenderLibur) {
    var hasil = [];
    var warna = []; 

    // 1. Ambil DB Audit
    var idSheetDatabase = '1sYQ6CQK8JAWEfUXxzf6OkdsTDcfHzRiOA_fOpxXWTyI';
    var ssData = SpreadsheetApp.openById(idSheetDatabase);
    
    function getDept(sheetName) {
        var s = ssData.getSheetByName(sheetName);
        if (!s) return [];
        var vals = s.getRange("B2:B100").getValues();
        return vals.map(function(r) { return String(r[0]).trim().toUpperCase() }).filter(function(v) { return v; });
    }

    var deptHB = getDept("HB");
    var deptRJ = getDept("RJ");
    var deptEL = getDept("EL");
    var deptLainnya = getDept("Lainnya");

    // 2. Mapping Libur
    var cacheLibur = {}; 
    if (kalenderLibur && kalenderLibur.length > 0) {
        for (var i = 0; i < kalenderLibur.length; i++) {
            if (kalenderLibur[i].aktif) cacheLibur[kalenderLibur[i].tanggal] = true;
        }
    }

    // 3. AUTO-DETEKSI BULAN UTAMA
    var monthCounts = {};
    var maxCount = 0;
    var targetMonthStr = "";
    
    for(var i = 1; i < dataArray.length; i++){
        var row = dataArray[i];
        if(!row || row.length < 3 || !row[0]) continue;
        var tglFull = String(row[1]).split(' ')[0]; 
        var parts = tglFull.split('/');
        if(parts.length >= 3) {
            var mStr = parts[1] + "/" + parts[2]; 
            if(!monthCounts[mStr]) monthCounts[mStr] = 0;
            monthCounts[mStr]++;
            if(monthCounts[mStr] > maxCount) {
                maxCount = monthCounts[mStr];
                targetMonthStr = mStr; 
            }
        }
    }

    // 4. Ekstraksi Unik & Buang Libur serta Lintas Bulan
    var rawEmpDays = {}; 
    var allDatesSet = {};
    for(var i = 1; i < dataArray.length; i++){
        var row = dataArray[i];
        if(!row || row.length < 3 || !row[0]) continue;
        var nama = String(row[0]).trim().toUpperCase();
        var tgl = String(row[1]).split(' ')[0];
        
        var tglParts = tgl.split('/');
        if(tglParts.length >= 3 && (tglParts[1] + "/" + tglParts[2]) !== targetMonthStr) {
            continue; 
        }
        
        if(!rawEmpDays[nama]) rawEmpDays[nama] = {};
        rawEmpDays[nama][tgl] = true;
        allDatesSet[tgl] = true;
    }

    var validDates = [];
    for(var d in allDatesSet) {
        if(!cacheLibur[d]) validDates.push(d); 
    }

    // 5. Generate Jadwal Lembur Random Per Dept
    function pickRandomDays(arr, count) {
        var shuffled = arr.slice().sort(function(){return 0.5 - Math.random()});
        return shuffled.slice(0, count);
    }

    var countHB = Math.floor(Math.random() * 2) + 2;
    var countRJ = Math.floor(Math.random() * 2) + 2;
    var countEL = Math.floor(Math.random() * 2) + 2;

    var otHB = pickRandomDays(validDates, countHB);
    var otRJ = pickRandomDays(validDates, countRJ);
    var otEL = pickRandomDays(validDates, countEL);

    var masterOTSet = {};
    otHB.forEach(function(d){ masterOTSet[d] = true; });
    otRJ.forEach(function(d){ masterOTSet[d] = true; });
    otEL.forEach(function(d){ masterOTSet[d] = true; });
    var allMasterOT = Object.keys(masterOTSet);

    function warnaBaris(hex) { warna.push([hex, hex, hex, hex, hex, hex, hex]); }

    // 6. Normalisasi & Generate Output
    var sortedNames = Object.keys(rawEmpDays).sort();

    for(var n = 0; n < sortedNames.length; n++) {
        var nama = sortedNames[n];
        var dept = "Unknown";
        if(deptHB.indexOf(nama) > -1) dept = "HB";
        else if(deptRJ.indexOf(nama) > -1) dept = "RJ";
        else if(deptEL.indexOf(nama) > -1) dept = "EL";
        else if(deptLainnya.indexOf(nama) > -1) dept = "Lainnya";

        if(dept === "Unknown") {
            continue; 
        }

        var otPersonLainnya = [];
        if (dept === "Lainnya" && allMasterOT.length > 0) {
            var countLainnya = Math.floor(Math.random() * 4); // Acak 0, 1, 2, 3 hari
            otPersonLainnya = pickRandomDays(allMasterOT, Math.min(countLainnya, allMasterOT.length));
        }

        hasil.push([nama + " (" + dept + ")", "Waktu", "Status", "Jam Kerja Total", "JK", "Lembur", "Keterangan"]);
        warnaBaris("#3B3838");

        var tgls = Object.keys(rawEmpDays[nama]).sort(function(a, b){
            var aa = parseWaktu(a + " 00.00").getTime();
            var bb = parseWaktu(b + " 00.00").getTime();
            return aa - bb;
        });

        var totalHari = 0;
        var totalLembur = 0;

        for(var t = 0; t < tgls.length; t++) {
            var tgl = tgls[t];
            
            if(cacheLibur[tgl]) continue; 

            var dtObj = parseWaktu(tgl + " 00.00");
            var isJumat = dtObj.getDay() === 5;
            var currentColor = isJumat ? "#FFFF00" : "#FFFFFF";

            var lemburDur = 0;
            if(dept === "HB" && otHB.indexOf(tgl) > -1) lemburDur = 3;
            else if(dept === "RJ" && otRJ.indexOf(tgl) > -1) lemburDur = 3;
            else if(dept === "EL" && otEL.indexOf(tgl) > -1) lemburDur = 3;
            else if(dept === "Lainnya" && otPersonLainnya.indexOf(tgl) > -1) {
                var opts = [0.5, 1, 1.5, 2, 2.5, 3];
                lemburDur = opts[Math.floor(Math.random() * opts.length)];
            }

            // MAKSIMAL LEMBUR JUMAT 2.5 JAM
            if (isJumat && lemburDur > 2.5) {
                lemburDur = 2.5;
            }

            // --- GENERATE JAM MASUK (07:46 - 08:00) ---
            var minIn = Math.floor(Math.random() * 15) + 46; // Random 46 hingga 60
            var hIn = 7;
            if(minIn >= 60) { hIn = 8; minIn -= 60; }
            var strIn = tgl + " 0" + hIn + "." + (minIn < 10 ? "0" + minIn : minIn);

            // GENERATE JAM PULANG BASE (Jumat 17:30-40, Normal 17:00-10)
            var minOutBase = isJumat ? (Math.floor(Math.random() * 11) + 30) : Math.floor(Math.random() * 11);
            var hOutBase = 17;

            var addMins = lemburDur * 60;
            var totalMinOut = minOutBase + addMins;
            var hOutFinal = hOutBase + Math.floor(totalMinOut / 60);
            var mOutFinal = totalMinOut % 60;
            var strOut = tgl + " " + hOutFinal + "." + (mOutFinal < 10 ? "0" + mOutFinal : mOutFinal);

            var infoKet = "OK"; 

            hasil.push([nama, strIn, "C/MASUK", "", "", "", infoKet]);
            warnaBaris(currentColor);

            var totalJK = 8 + lemburDur;
            hasil.push([nama, strOut, "C/KELUAR", totalJK, 8, lemburDur || "", infoKet]);
            warnaBaris(currentColor);

            totalHari++;
            totalLembur += lemburDur;
        }

        hasil.push(["", "", "", totalHari + " hari", "", totalLembur || "", "TOTAL AKUMULASI"]);
        warnaBaris("#E2EFDA");
        hasil.push(["", "", "", "", "", "", ""]); warnaBaris("#FFFFFF");
        hasil.push(["", "", "", "", "", "", ""]); warnaBaris("#FFFFFF");
    }

    var fileBaruId = simpanDanWarnai(hasil, warna, 'AUDIT');
    var linkDrive = "https://docs.google.com/spreadsheets/d/" + fileBaruId + "/edit";
    var linkDownload = "https://docs.google.com/spreadsheets/d/" + fileBaruId + "/export?format=xlsx";

    return { status: 'success', driveUrl: linkDrive, downloadUrl: linkDownload };
}

// ==========================================
// 🎨 WRITER: MENYIMPAN, MEWARNAI & MEMBUAT LEGENDA
// ==========================================
function simpanDanWarnai(values, backgrounds, mode) {
  var prefix = mode === 'AUDIT' ? "Laporan Audit - " : "Laporan Payroll - ";
  var namaFile = prefix + Utilities.formatDate(new Date(), "Asia/Jakarta", "dd-MM-yyyy HH:mm");
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

  var legends = [];
  if (mode === 'AUDIT') {
      legends = [
        { text: "Shift Pagi (Normal)", color: "#FFFFFF" },
        { text: "Jumat", color: "#FFFF00" },
        { text: "Total Akumulasi", color: "#E2EFDA" }
      ];
  } else {
      legends = [
        { text: "Normal (Hari Kerja)", color: "#FFFFFF" },
        { text: "Jumat (Istirahat 1.5 Jam)", color: "#FFFF00" },
        { text: "Sabtu/Minggu/Tgl Merah", color: "#FFC000" },
        { text: "Error / Invalid Absen", color: "#FFCCCC" },
        { text: "Total Akumulasi", color: "#E2EFDA" }
      ];
  }

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

  return ss.getId();
}
