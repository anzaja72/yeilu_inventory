
const SPREADSHEET_ID = '1eJAuYVCudO_2aDYwzzegL1yaOe4HL8uVmkfzhBa-USo';

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  if (data.action === 'REGISTER_PRODUCT') {
    const sheet = ss.getSheetByName('Maestro_Productos');
    sheet.appendRow([data.reference, data.name, data.type, data.cost, data.salePrice, data.minStock]);
    return response({ status: 'success' });
  }

  if (data.action === 'REGISTER_MOVEMENT') {
    const sheet = ss.getSheetByName('Log_Movimientos');
    sheet.appendRow([
      Utilities.getUuid(),
      new Date().toISOString(),
      data.username,
      data.sedeId, // Sede Origen
      data.destinationSedeId || '-', // Sede Destino
      data.reference,
      data.quantity,
      data.movementType
    ]);
    return response({ status: 'success' });
  }
}

function doGet(e) {
  const action = e.parameter.action;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  if (action === 'GET_ALL') {
    const maestro = getSheetData(ss, 'Maestro_Productos');
    const logs = getSheetData(ss, 'Log_Movimientos');
    const usuarios = getSheetData(ss, 'Usuarios');
    return response({ maestro, logs, usuarios });
  }
}

function getSheetData(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 1) return [];
  const headers = data.shift();
  return data.map(row => {
    let obj = {};
    headers.forEach((h, i) => {
      if (h) obj[h.toString().trim()] = row[i];
    });
    return obj;
  });
}

function response(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
