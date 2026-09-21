'use strict';

// Local ledger fields (unit, thresholds, price) belong to the imported inventory.
// Shared master descriptors must not be overwritten by another workshop's ledger.
function changedSharedDescriptors(current, record) {
  const values = {
    name: record.materialDesc,
    spec: record.spec,
    part_type: record.partType,
    usage_description: record.usageDescription,
    remark: record.remark
  };
  return Object.entries(values).filter(([field, value]) => value != null && value !== ''
    && String(value).trim() !== String(current[field] ?? '').trim()).map(([field]) => field);
}
module.exports = { changedSharedDescriptors };
