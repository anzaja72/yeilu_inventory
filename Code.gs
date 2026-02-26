
const SPREADSHEET_ID = '1eJAuYVCudO_2aDYwzzegL1yaOe4HL8uVmkfzhBa-USo';

/**
 * ============================================================================
 * MIGRACIÓN A N8N WEBHOOKS (2026)
 * ============================================================================
 * NOTA IMPORTANTE:
 * La arquitectura de la aplicación "Yeilu Store" se ha unificado para usar 
 * n8n como único backend.
 * 
 * - El inicio de sesión (login) ahora se maneja a través del webhook de n8n:
 *   https://icad-n8n.ltubgr.easypanel.host/webhook/d3d159ca-7ae5-47eb-ab07-7d7a01bf9755
 * 
 * - Los endpoints de este script de Google Apps Script (GAS) están siendo 
 *   migrados gradualmente a n8n.
 * 
 * ESTADO ACTUAL DE LOS ENDPOINTS EN GAS:
 * - doPost: REGISTER_PRODUCT y REGISTER_MOVEMENT ya no son utilizados por 
 *   el frontend principal (se usan los webhooks de n8n).
 * - doGet: GET_ALL se utilizaba para el login (obteniendo la tabla 'Usuarios'). 
 *   Ya no es requerido por la app principal, pero se mantiene por compatibilidad 
 *   hacia atrás o para migración gradual.
 * ============================================================================
 */

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
