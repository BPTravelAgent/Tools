/**
 * BP TRAVEL TOOLS — GOOGLE SHEETS & DRIVE SYNC ENGINE (v2.0)
 * Automatically converts Tour Costing Excel files to native Google Sheets.
 * 
 * Features:
 *  1. In-Place Update: If a spreadsheet already exists for this INQ, it updates
 *     that exact spreadsheet in Google Drive (adds/replaces Option tabs) without creating duplicates!
 *  2. Multi-Option Support: Keeps all package option tabs (e.g. Option 1, Option 2) cleanly organized.
 *  3. Auto-Recovery: If the user deleted the spreadsheet from Google Drive, automatically creates a new one.
 *  4. High Performance: Temporary files are cleaned up automatically.
 */

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var base64 = payload.base64;
    var fileName = payload.fileName || ("Tour Costing - " + Utilities.formatDate(new Date(), "GMT+5:30", "yyyy-MM-dd HH:mm"));
    var folderName = payload.folderName || "BP Travel Costings";
    var existingSheetId = payload.sheetId || extractSpreadsheetId(payload.sheetUrl);

    // 1. Locate or create destination folder in Google Drive
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    // 2. Decode incoming Excel binary buffer
    var decodedBytes = Utilities.base64Decode(base64);
    var excelBlob = Utilities.newBlob(decodedBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);

    // 3. Check if we have an existing spreadsheet to update in-place
    var targetSpreadsheet = null;
    if (existingSheetId) {
      try {
        var existingFile = DriveApp.getFileById(existingSheetId);
        if (existingFile && !existingFile.isTrashed()) {
          targetSpreadsheet = SpreadsheetApp.openById(existingSheetId);
        }
      } catch (err) {
        targetSpreadsheet = null;
      }
    }

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
        fileId: driveFile.getId(),
        isUpdated: false
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 5. If we have an existing spreadsheet, MERGE / REPLACE all sheets from the newly converted file!
    if (targetSpreadsheet) {
      var tempSpreadsheet = SpreadsheetApp.openById(newSheetFile.id);
      var newSheets = tempSpreadsheet.getSheets();
      var oldSheets = targetSpreadsheet.getSheets();

      // Temporary rename of old sheets to prevent name collisions
      for (var o = 0; o < oldSheets.length; o++) {
        try {
          oldSheets[o].setName("__old_" + o + "_" + Utilities.getUuid().substring(0, 5));
        } catch(e) {}
      }

      // Copy each converted sheet into the target spreadsheet
      for (var n = 0; n < newSheets.length; n++) {
        var srcSheet = newSheets[n];
        var copiedSheet = srcSheet.copyTo(targetSpreadsheet);
        copiedSheet.setName(srcSheet.getName());
      }

      // Delete the old sheets
      for (var d = 0; d < oldSheets.length; d++) {
        try {
          targetSpreadsheet.deleteSheet(oldSheets[d]);
        } catch(e) {}
      }

      // Rename target spreadsheet title to match current quotation title
      try {
        targetSpreadsheet.rename(fileName);
      } catch(e) {}

      // Delete the temporary file permanently
      try {
        DriveApp.getFileById(newSheetFile.id).setTrashed(true);
      } catch(e) {}

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        sheetUrl: targetSpreadsheet.getUrl(),
        fileId: targetSpreadsheet.getId(),
        isUpdated: true,
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

function extractSpreadsheetId(url) {
  if (!url) return null;
  var match = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : (String(url).indexOf("http") === -1 ? String(url) : null);
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "BP Travel Google Sheets API is running!",
    version: "2.0-in-place-update"
  })).setMimeType(ContentService.MimeType.JSON);
}
