/**
 * BP TRAVEL TOOLS — GOOGLE SHEETS & DRIVE SYNC ENGINE (v3.0)
 * Automatically converts Tour Costing Excel files to native Google Sheets.
 *
 * Features:
 *  1. Smart Drive Matching: Matches existing Google Sheets by explicit sheetId/sheetUrl,
 *     EXACT spreadsheet fileName, OR matching INQ reference number in "BP Travel Costings"
 *     so duplicate files are NEVER created in Drive.
 *  2. Append "New" Tab Inside Existing Sheet (Default): Preserves all existing sheet tabs
 *     untouched and inserts the updated costing inside THAT SAME spreadsheet as a "New" tab
 *     (or "New (2)", "New - Option 01", etc.) and opens directly on the new tab (#gid=).
 *  3. Optional Full Replace Mode: Supports updateMode === "replace_all" if needed.
 *  4. Auto-Recovery & Temp Cleanup: Safely trashes temporary converted files.
 */

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var base64 = payload.base64;
    var fileName = String(payload.fileName || ("Tour Costing - " + Utilities.formatDate(new Date(), "GMT+5:30", "yyyy-MM-dd HH:mm"))).trim();
    var folderName = payload.folderName || "BP Travel Costings";
    var inqRef = payload.inq ? String(payload.inq).trim() : extractInqFromFileName(fileName);
    var existingSheetId = payload.sheetId || extractSpreadsheetId(payload.sheetUrl);
    var updateMode = payload.updateMode || "append_new_tab";

    // 1. Locate or create destination folder in Google Drive
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    // 2. Decode incoming Excel binary buffer
    var decodedBytes = Utilities.base64Decode(base64);
    var excelBlob = Utilities.newBlob(decodedBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);

    // 3. Locate existing spreadsheet: explicit sheetId -> exact Drive fileName -> same INQ in folder
    var matchResult = resolveTargetSpreadsheet(folder, existingSheetId, fileName, inqRef);
    var targetSpreadsheet = matchResult.spreadsheet;
    var matchedBy = matchResult.matchedBy;

    // 4. Convert incoming .xlsx to a native Google Sheet
    var fileMetadata = {
      title: (targetSpreadsheet ? "TEMP_" : "") + fileName,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [{ id: folder.getId() }]
    };

    var newSheetFile;
    if (typeof Drive !== "undefined" && Drive.Files && Drive.Files.insert) {
      newSheetFile = Drive.Files.insert(fileMetadata, excelBlob, { convert: true });
    } else if (typeof Drive !== "undefined" && Drive.Files && Drive.Files.create) {
      newSheetFile = Drive.Files.create({
        name: (targetSpreadsheet ? "TEMP_" : "") + fileName,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [folder.getId()]
      }, excelBlob);
    } else {
      var driveFile = folder.createFile(excelBlob);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        sheetUrl: driveFile.getUrl(),
        tabUrl: driveFile.getUrl(),
        fileId: driveFile.getId(),
        isUpdated: false
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 5. If we found an existing spreadsheet, update inside THAT SAME spreadsheet!
    if (targetSpreadsheet) {
      var tempSpreadsheet = SpreadsheetApp.openById(newSheetFile.id);
      var newSheets = tempSpreadsheet.getSheets();
      var addedTabNames = [];
      var firstAddedSheet = null;

      if (updateMode === "replace_all") {
        var oldSheets = targetSpreadsheet.getSheets();
        for (var o = 0; o < oldSheets.length; o++) {
          try {
            oldSheets[o].setName("__old_" + o + "_" + Utilities.getUuid().substring(0, 5));
          } catch (errOld) {}
        }
        for (var n = 0; n < newSheets.length; n++) {
          var srcRep = newSheets[n];
          var copiedRep = srcRep.copyTo(targetSpreadsheet);
          var repName = getUniqueSheetName(targetSpreadsheet, srcRep.getName());
          copiedRep.setName(repName);
          if (!firstAddedSheet) firstAddedSheet = copiedRep;
          addedTabNames.push(repName);
        }
        for (var d = 0; d < oldSheets.length; d++) {
          try {
            targetSpreadsheet.deleteSheet(oldSheets[d]);
          } catch (errDel) {}
        }
      } else {
        // Default: Keep all old tabs intact & append updated tab(s) named "New" inside same file
        for (var k = 0; k < newSheets.length; k++) {
          var srcSheet = newSheets[k];
          var desiredBaseName = (newSheets.length === 1)
            ? "New"
            : ("New - " + String(srcSheet.getName() || ("Option " + (k + 1)))).trim();
          var targetTabName = getUniqueSheetName(targetSpreadsheet, desiredBaseName);
          var copiedSheet = srcSheet.copyTo(targetSpreadsheet);
          copiedSheet.setName(targetTabName);
          if (!firstAddedSheet) firstAddedSheet = copiedSheet;
          addedTabNames.push(targetTabName);
        }
      }

      if (firstAddedSheet) {
        try {
          targetSpreadsheet.setActiveSheet(firstAddedSheet);
        } catch (errAct) {}
      }

      if (fileName) {
        try {
          targetSpreadsheet.rename(fileName);
        } catch (errRen) {}
      }

      try {
        DriveApp.getFileById(newSheetFile.id).setTrashed(true);
      } catch (errTrash) {}

      var baseUrl = String(targetSpreadsheet.getUrl()).split("#")[0];
      var directTabUrl = firstAddedSheet ? (baseUrl + "#gid=" + firstAddedSheet.getSheetId()) : baseUrl;

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        sheetUrl: baseUrl,
        tabUrl: directTabUrl,
        fileId: targetSpreadsheet.getId(),
        isUpdated: true,
        updateMode: updateMode,
        matchedBy: matchedBy,
        addedTabNames: addedTabNames,
        fileName: fileName,
        folderUrl: folder.getUrl()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 6. Otherwise, it is a brand new spreadsheet:
    var sheetId = newSheetFile.id;
    var sheetUrl = "https://docs.google.com/spreadsheets/d/" + sheetId + "/edit";

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      sheetUrl: sheetUrl,
      tabUrl: sheetUrl,
      fileId: sheetId,
      isUpdated: false,
      folderUrl: folder.getUrl(),
      fileName: fileName
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Find an existing spreadsheet by sheetId first, then by exact fileName, then by INQ number in folder.
 */
function resolveTargetSpreadsheet(folder, existingSheetId, fileName, inqRef) {
  if (existingSheetId) {
    try {
      var explicitFile = DriveApp.getFileById(existingSheetId);
      if (explicitFile && !explicitFile.isTrashed()) {
        return { spreadsheet: SpreadsheetApp.openById(existingSheetId), matchedBy: "sheetId" };
      }
    } catch (err) {}
  }

  var targetNameNorm = String(fileName || "").trim().toLowerCase();
  var inqDigits = extractInqDigits(inqRef);
  var inqNoLeadingZeros = inqDigits ? inqDigits.replace(/^0+/, "") : "";
  var bestNameMatch = null;
  var bestNameTime = 0;
  var bestInqMatch = null;
  var bestInqTime = 0;

  try {
    var files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
    while (files.hasNext()) {
      var f = files.next();
      if (f.isTrashed()) continue;
      var fName = String(f.getName() || "").trim();
      if (!fName || fName.indexOf("TEMP_") === 0) continue;
      var updatedMs = f.getLastUpdated() ? f.getLastUpdated().getTime() : 0;

      if (targetNameNorm && fName.toLowerCase() === targetNameNorm) {
        if (updatedMs >= bestNameTime) {
          bestNameMatch = f;
          bestNameTime = updatedMs;
        }
        continue;
      }

      if (inqDigits && inqDigits.length >= 3 && fileMatchesInqToken(fName, inqDigits, inqNoLeadingZeros)) {
        if (updatedMs >= bestInqTime) {
          bestInqMatch = f;
          bestInqTime = updatedMs;
        }
      }
    }
  } catch (errScan) {}

  if (bestNameMatch) {
    return { spreadsheet: SpreadsheetApp.openById(bestNameMatch.getId()), matchedBy: "fileName" };
  }
  if (bestInqMatch) {
    return { spreadsheet: SpreadsheetApp.openById(bestInqMatch.getId()), matchedBy: "inq" };
  }
  return { spreadsheet: null, matchedBy: null };
}

function extractInqDigits(raw) {
  if (!raw) return "";
  var m = String(raw).match(/\d+/);
  return m ? m[0] : "";
}

function extractInqFromFileName(fileName) {
  if (!fileName) return "";
  var m = String(fileName).trim().match(/(?:INQ[\s\-]*)?(\d{3,})\s*$/i);
  return m ? m[1] : "";
}

function fileMatchesInqToken(fName, inqDigits, strippedDigits) {
  var safeFull = inqDigits.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var reFull = new RegExp("(?:^|[\\s\\-_]|INQ[\\s\\-]*)" + safeFull + "(?:$|[\\s\\-_\\.])", "i");
  if (reFull.test(fName)) return true;
  if (strippedDigits && strippedDigits.length >= 3) {
    var safeStripped = strippedDigits.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var reStripped = new RegExp("(?:^|[\\s\\-_]|INQ[\\s\\-]*)0*" + safeStripped + "(?:$|[\\s\\-_\\.])", "i");
    if (reStripped.test(fName)) return true;
  }
  return false;
}

/**
 * Generate a collision-free tab name inside targetSpreadsheet (respects 100-char Google Sheets limit).
 */
function getUniqueSheetName(spreadsheet, baseName) {
  var cleaned = String(baseName || "New").replace(/[\\/?*\[\]:]/g, "-").trim() || "New";
  if (cleaned.length > 90) cleaned = cleaned.substring(0, 90).trim();
  if (!spreadsheet.getSheetByName(cleaned)) {
    return cleaned;
  }
  var counter = 2;
  while (counter < 100) {
    var candidate = cleaned + " (" + counter + ")";
    if (!spreadsheet.getSheetByName(candidate)) {
      return candidate;
    }
    counter++;
  }
  return cleaned + " (" + Utilities.getUuid().substring(0, 4) + ")";
}

function extractSpreadsheetId(url) {
  if (!url) return null;
  var match = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : (String(url).indexOf("http") === -1 ? String(url) : null);
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "BP Travel Google Sheets API is running!",
    version: "3.0-smart-drive-match-and-new-tab"
  })).setMimeType(ContentService.MimeType.JSON);
}
