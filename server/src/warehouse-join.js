'use strict';

// Legacy inventory rows may contain a warehouse code OR name. Resolve exactly
// one code inside the row's workshop; never join all same-named warehouses.
function warehouseJoin(inventoryAlias = 'i', warehouseAlias = 'w') {
  for (const alias of [inventoryAlias, warehouseAlias]) {
    if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid SQL alias');
  }
  return `LEFT JOIN warehouses ${warehouseAlias} ON ${warehouseAlias}.workshop_code=COALESCE(${inventoryAlias}.workshop_code,'raw_grain')
    AND ${warehouseAlias}.code=(SELECT warehouse_lookup.code FROM warehouses warehouse_lookup
      WHERE warehouse_lookup.workshop_code=COALESCE(${inventoryAlias}.workshop_code,'raw_grain')
        AND (warehouse_lookup.code=${inventoryAlias}.warehouse OR warehouse_lookup.name=${inventoryAlias}.warehouse)
      ORDER BY (warehouse_lookup.code=${inventoryAlias}.warehouse) DESC,warehouse_lookup.code LIMIT 1)`;
}

module.exports = { warehouseJoin };
