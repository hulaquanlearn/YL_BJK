'use strict';

function text(value) {
  return String(value ?? '').trim();
}

function duplicateLocationErrors(records, existingOccupants = []) {
  const errors = [];
  const fileLocations = new Map();

  for (const record of records) {
    const locationCode = text(record.locationCode);
    if (!locationCode) continue;
    const rows = fileLocations.get(locationCode) || [];
    rows.push(record);
    fileLocations.set(locationCode, rows);
  }

  for (const [locationCode, rows] of fileLocations) {
    if (rows.length < 2) continue;
    const rowNumbers = rows.map(item => item.sourceRow).join('、');
    for (const record of rows) {
      errors.push({
        row: record.sourceRow,
        field: '六位库位码',
        reason: `货位${locationCode}在本次台账第${rowNumbers}行重复`,
        suggestion: '一个物理货位只保留一个备件；请修改重复行的六位库位码或清空库位后重新导入'
      });
    }
  }

  const occupantsByLocation = new Map();
  for (const occupant of existingOccupants) {
    const locationCode = text(occupant.locationCode);
    if (!locationCode) continue;
    const codes = occupantsByLocation.get(locationCode) || new Set();
    codes.add(text(occupant.materialCode));
    occupantsByLocation.set(locationCode, codes);
  }

  for (const record of records) {
    const locationCode = text(record.locationCode);
    const occupants = occupantsByLocation.get(locationCode);
    if (!locationCode || !occupants?.size) continue;
    const conflictingCodes = [...occupants].filter(code => code && code !== text(record.materialCode));
    if (!conflictingCodes.length) continue;
    errors.push({
      row: record.sourceRow,
      field: '六位库位码',
      reason: `货位${locationCode}已被物料${conflictingCodes.join('、')}占用`,
      suggestion: '为当前备件填写未被占用的六位库位码；如需调整原备件，请先在台账中修改原备件库位'
    });
  }

  return errors;
}

module.exports = { duplicateLocationErrors };
