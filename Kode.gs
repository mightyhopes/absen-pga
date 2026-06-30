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

function getDatabaseArray(ssData, sheetName) {
    var sheet = ssData.getSheetByName(sheetName);
    var arr = [];
    if(sheet) {
        var data = sheet.getRange("B2:B150").getValues();
        for(var r=0; r<data.length; r++) {
            if(data[r][0]) arr.push(String(data[r][0]).trim().toUpperCase());
        }
    }
    return arr;
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
// 🛡️ ENGINE 1: PAYROLL 
// ==========================================
function prosesPayroll(dataArray, kalenderLibur) {
    var hasil = [];
    var warna = []; 
    var dataPerNama = {};
    var urutanNama = [];

    var idSheetDatabase = '1sYQ6CQK8JAWEfUXxzf6OkdsTDcfHzRiOA_fOpxXWTyI';
    var ssData = SpreadsheetApp.openById(idSheetDatabase);
    
    var KARYAWAN_KONTRAK = getDatabaseArray(ssData, "KK");
    var KARYAWAN_HL = getDatabaseArray(ssData, "HL");
    var KARYAWAN_STAFF = getDatabaseArray(ssData, "STAFF");
    var KARYAWAN_ALL_IN = getDatabaseArray(ssData, "ALL_IN");

    var cacheLiburProduksi = {}; 
    var cacheLiburStaff = {}; 
    
    if (kalenderLibur && kalenderLibur.length > 0) {
        for (var i = 0; i < kalenderLibur.length; i++) {
            if (kalenderLibur[i].aktif) {
                var tgl = kalenderLibur[i].tanggal;
                var target = kalenderLibur[i].target || 'semua';
                if (target === 'semua' || target === 'produksi') cacheLiburProduksi[tgl] = true;
                if (target === 'semua' || target === 'staff') cacheLiburStaff[tgl] = true;
            }
        }
    }

    var monthCounts = {};
    var maxCount = 0;
    var targetMonthStr = "";
    
    for (var i = 1; i < dataArray.length; i++) {
        var row = dataArray[i];
        if (!row || row.length < 3 || !row[0]) continue;
        var tglFull = String(row[1]).split(' ')[0]; 
        var parts = tglFull.split('/');
        if (parts.length >= 3) {
            var mStr = parts[1] + "/" + parts[2]; 
            if (!monthCounts[mStr]) monthCounts[mStr] = 0;
            monthCounts[mStr]++;
            if (monthCounts[mStr] > maxCount) {
                maxCount = monthCounts[mStr];
                targetMonthStr = mStr; 
            }
        }
    }

    function isWorkingDay(tglStr, checkIsStaff) {
        if (checkIsStaff) return !cacheLiburStaff[tglStr];
        return !cacheLiburProduksi[tglStr];
    }

    function getHariKerjaEfektif(checkIsStaff, tMonthStr) {
        var efektifDates = [];
        if (!tMonthStr) return efektifDates;
        var tmParts = tMonthStr.split('/');
        var mo = parseInt(tmParts[0], 10) - 1;
        var yr = parseInt(tmParts[1], 10);
        var daysInMo = new Date(yr, mo + 1, 0).getDate();
        for (var d = 1; d <= daysInMo; d++) {
            var ddStr = String(d).padStart(2, '0');
            var mmStr = String(mo + 1).padStart(2, '0');
            var tglCheck = ddStr + "/" + mmStr + "/" + yr;
            if (isWorkingDay(tglCheck, checkIsStaff)) {
                efektifDates.push(tglCheck);
            }
        }
        return efektifDates;
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
      var nKey = namaKaryawan.toUpperCase();
      
      var isKK = (KARYAWAN_KONTRAK.indexOf(nKey) !== -1);
      var isHL = (KARYAWAN_HL.indexOf(nKey) !== -1);
      var isStaff = (KARYAWAN_STAFF.indexOf(nKey) !== -1);
      var isAllIn = (KARYAWAN_ALL_IN.indexOf(nKey) !== -1);
      
      var tipeString = isStaff ? "STAFF" : (isKK ? "KK" : (isHL ? "HL" : "HL"));
      if (isAllIn) tipeString += " / ALL-IN";

      hasil.push([namaKaryawan + " (" + tipeString + ")", "Waktu", "Status", "Jam Kerja Total", "JK", "Lembur", "Keterangan"]);
      warnaBaris("#3B3838");

      var totalLemburKaryawan = 0;
      var totalHariKaryawan = 0; 
      var trackerMasuk = null; 
      var prevEvent = null;
      var hariTercatatNormal = {}; 
      var hariHadirValid = {}; 

      for (var k = 0; k < absenKaryawan.length; k++) {
        var a = absenKaryawan[k];
        var dtCurrent = parseWaktu(a.waktuStr);
        var tglCekStr = a.waktuStr.split(' ')[0];
        var dayIndex = dtCurrent.getDay();
        
        var isHariLibur = isStaff ? (cacheLiburStaff[tglCekStr] || false) : (cacheLiburProduksi[tglCekStr] || false);
        var isJumat = (dayIndex === 5);
        
        var currentColor = "#FFFFFF"; 
        if (isHariLibur) currentColor = "#FFC000"; 
        else if (isJumat) currentColor = "#FFFF00"; 

        if (prevEvent !== null && a.status === prevEvent.status) {
            var gapDuplikat = (dtCurrent.getTime() - prevEvent.dt.getTime()) / (1000 * 60 * 60);
            if (gapDuplikat > 0 && gapDuplikat < HR_CONFIG.BATAS_WAKTU.DUPLIKAT_STATUS) {
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

                        // FIX BUG: Hapus isRandomStart. 
                        // Shift kurang dari 4 jam hanya jadi lembur JIKA hari libur, atau sdh kerja full sblmnya.
                        if (trackerMasuk.isLibur) {
                            if (isKK) {
                                outLembur = jamEfektif;
                                outTotal = jamEfektif;
                                ket = baseKet + "Lembur Libur Singkat";
                            } else {
                                outJk = jamEfektif;
                                outTotal = jamEfektif;
                                ket = baseKet + "Kerja Libur Singkat";
                            }
                        } else if (hariTercatatNormal[tglMasukAsli]) {
                            outLembur = jamEfektif;
                            outTotal = jamEfektif;
                            ket = baseKet + "Lembur Tambahan";
                        } else {
                            if (isKK) {
                                if (jamEfektif >= 4) {
                                    outJk = jamEfektif;
                                    outTotal = jamEfektif;
                                    ket = baseKet + "Kerja 4 Jam (KK)";
                                } else {
                                    outTotal = ""; outJk = 0; outLembur = 0;
                                    ket = baseKet + "Izin (Kerja < 4 Jam)";
                                }
                            } else {
                                outJk = jamEfektif;
                                outTotal = jamEfektif;
                                ket = baseKet + "Kerja Singkat";
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
                    var durasiKotor = endEffective - baseStart;
                    var potongIstirahat = 0;

                    // FIX BUG: HANYA potong jam istirahat jika durasi kotor lebih dari 4.0 jam.
                    // Jadi karyawan yang bekerja pas 4 jam tidak akan hangus dihitung "Izin".
                    if (durasiKotor > 4.0) {
                        if (trackerMasuk.isJum) {
                            potongIstirahat = HR_CONFIG.ISTIRAHAT.JUMAT;
                        } else {
                            potongIstirahat = HR_CONFIG.ISTIRAHAT.NORMAL;
                        }
                    }

                    var jkKotor = durasiKotor - potongIstirahat;
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
                                outJk = jkKotor; // 4 Jam akan terisi ke sini dengan akurat!
                            }
                        }
                        ket = baseKet + "Hadir";
                    }
                }

                if (!ket && baseKet) ket = a.pengecualian; 
                
                if (isAllIn && ket !== "") {
                    ket += " [ALL-IN]";
                }

                outTotal = formatDesimal(outTotal);
                outJk = formatDesimal(outJk);
                outLembur = formatDesimal(outLembur);

                if (outLembur !== "" && outLembur > 0) totalLemburKaryawan += parseFloat(outLembur);
                if (outTotal !== "" && outTotal > 0) {
                    totalHariKaryawan++;
                    hariHadirValid[tglMasukAsli] = true;
                }

                hasil.push([a.nama, a.waktuStr, a.status, outTotal, outJk, outLembur, ket]);
                
                var lockedColor = "#FFFFFF";
                if (trackerMasuk.isLibur) lockedColor = "#FFC000";
                else if (trackerMasuk.isJum) lockedColor = "#FFFF00";

                warnaBaris(lockedColor);
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
      
      var ketAkumulasi = "TOTAL AKUMULASI";
      var tmkDatesStr = "";
      if (isKK) {
          var hkEfektif = getHariKerjaEfektif(isStaff, targetMonthStr);
          var tmkCount = 0;
          var tmkDates = [];
          for (var hk = 0; hk < hkEfektif.length; hk++) {
              if (!hariHadirValid[hkEfektif[hk]]) {
                  tmkCount++;
                  tmkDates.push(hkEfektif[hk].substring(0, 5));
              }
          }
          ketAkumulasi = "TMK: " + tmkCount + " hari";
          if (tmkCount > 0) {
              tmkDatesStr = "Detail Tgl TMK: " + tmkDates.join(", ");
          }
      }

      hasil.push(["", "", "", teksHari, "", totalAkhirLembur, ketAkumulasi]);
      warnaBaris("#E2EFDA"); 
      
      if (tmkDatesStr !== "") {
          hasil.push([tmkDatesStr, "", "", "", "", "", ""]);
          warnaBaris("#FFEEEE");
      }
      hasil.push(["", "", "", "", "", "", ""]); warnaBaris("#FFFFFF");
      hasil.push(["", "", "", "", "", "", ""]); warnaBaris("#FFFFFF");
    }

    var fileBaruId = simpanDanWarnai(hasil, warna, 'PAYROLL');
    var linkDrive = "https://docs.google.com/spreadsheets/d/" + fileBaruId + "/edit";
    var linkDownload = "https://docs.google.com/spreadsheets/d/" + fileBaruId + "/export?format=xlsx";

    return { status: 'success', driveUrl: linkDrive, downloadUrl: linkDownload };
}

// ==========================================
// 🕵️‍♂️ ENGINE 2: AUDIT 
// ==========================================
function prosesAudit(dataArray, kalenderLibur) {
    var hasil = [];
    var warna = []; 

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
    var deptSC = getDept("sc"); 

    var scMapping = {}; 
    deptSC.forEach(function(nama, idx) {
        scMapping[nama] = idx % 4; 
    });

    var cacheLibur = {}; 
    if (kalenderLibur && kalenderLibur.length > 0) {
        for (var i = 0; i < kalenderLibur.length; i++) {
            if (kalenderLibur[i].aktif) cacheLibur[kalenderLibur[i].tanggal] = true;
        }
    }

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

    var sortedNames = Object.keys(rawEmpDays).sort();

    for(var n = 0; n < sortedNames.length; n++) {
        var nama = sortedNames[n];
        var dept = "Unknown";
        
        if(deptHB.indexOf(nama) > -1) dept = "HB";
        else if(deptRJ.indexOf(nama) > -1) dept = "RJ";
        else if(deptEL.indexOf(nama) > -1) dept = "EL";
        else if(deptSC.indexOf(nama) > -1) dept = "SC"; 
        else if(deptLainnya.indexOf(nama) > -1) dept = "Lainnya";

        if(dept === "Unknown") {
            continue; 
        }

        var otPersonLainnya = [];
        if (dept === "Lainnya" && allMasterOT.length > 0) {
            var countLainnya = Math.floor(Math.random() * 4); 
            otPersonLainnya = pickRandomDays(allMasterOT, Math.min(countLainnya, allMasterOT.length));
        }

        hasil.push([nama + " (" + dept + ")", "Waktu", "Status", "Jam Kerja Total", "JK", "Lembur", "Keterangan"]);
        warnaBaris("#3B3838");

        var tgls = [];
        
        if (dept === "SC" && targetMonthStr) {
            var tmParts = targetMonthStr.split('/');
            var mo = parseInt(tmParts[0], 10) - 1;
            var yr = parseInt(tmParts[1], 10);
            var daysInMo = new Date(yr, mo + 1, 0).getDate();
            for(var d = 1; d <= daysInMo; d++) {
                var ddStr = String(d).padStart(2, '0');
                var mmStr = String(mo + 1).padStart(2, '0');
                tgls.push(ddStr + "/" + mmStr + "/" + yr);
            }
        } else {
            tgls = Object.keys(rawEmpDays[nama]).sort(function(a, b){
                var aa = parseWaktu(a + " 00.00").getTime();
                var bb = parseWaktu(b + " 00.00").getTime();
                return aa - bb;
            });
        }

        var totalHari = 0;
        var totalLembur = 0;

        for(var t = 0; t < tgls.length; t++) {
            var tgl = tgls[t];
            var dateObj = parseWaktu(tgl + " 00.00");
            var isJumat = dateObj.getDay() === 5;
            var currentColor = isJumat ? "#FFFF00" : "#FFFFFF";
            
            if (dept === "SC") {
                var shiftOffset = scMapping[nama];
                var hariKe = (dateObj.getDate() - 1 + shiftOffset) % 4;
                var shift = ['P','S','M','L'][hariKe];
                
                if (shift === 'L') continue; 
                
                var jadwal = {
                    'P': { in: "06.50", out: "15.10" },
                    'S': { in: "14.50", out: "23.10" },
                    'M': { in: "22.50", out: "07.10" }
                }[shift];
                
                var strIn = tgl + " " + jadwal.in;
                var strOut = "";
                
                if (shift === 'M') {
                    var dtNext = new Date(dateObj.getTime());
                    dtNext.setDate(dtNext.getDate() + 1);
                    var ddOut = String(dtNext.getDate()).padStart(2, '0');
                    var mmOut = String(dtNext.getMonth() + 1).padStart(2, '0');
                    var yyyyOut = dtNext.getFullYear();
                    strOut = ddOut + "/" + mmOut + "/" + yyyyOut + " " + jadwal.out;
                } else {
                    strOut = tgl + " " + jadwal.out;
                }

                hasil.push([nama, strIn, "C/MASUK", "", "", "", "Shift " + shift]);
                warnaBaris(currentColor);
                
                hasil.push([nama, strOut, "C/KELUAR", 8, 8, "", "Shift " + shift]);
                warnaBaris(currentColor);
                
                totalHari++;
                continue; 
            }

            if(cacheLibur[tgl]) continue; 

            var lemburDur = 0;
            if(dept === "HB" && otHB.indexOf(tgl) > -1) lemburDur = 3;
            else if(dept === "RJ" && otRJ.indexOf(tgl) > -1) lemburDur = 3;
            else if(dept === "EL" && otEL.indexOf(tgl) > -1) lemburDur = 3;
            else if(dept === "Lainnya" && otPersonLainnya.indexOf(tgl) > -1) {
                var opts = [0.5, 1, 1.5, 2, 2.5, 3];
                lemburDur = opts[Math.floor(Math.random() * opts.length)];
            }

            if (isJumat && lemburDur > 2.5) {
                lemburDur = 2.5;
            }

            var minIn = Math.floor(Math.random() * 10) + 51; 
            var hIn = 7;
            if(minIn >= 60) { hIn = 8; minIn -= 60; }
            var strIn = tgl + " 0" + hIn + "." + (minIn < 10 ? "0" + minIn : minIn);

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