import type { SQLiteDatabase } from 'expo-sqlite';

export async function getWorkerRates(db: SQLiteDatabase, workerId: number): Promise<Record<string, number>> {
  const rows = await db.getAllAsync<{ name: string; delb_rate: number }>(`SELECT name, delb_rate FROM worker_rates WHERE worker_id = ?`, [workerId]);
  const map: Record<string, number> = {};
  for (const r of rows) map[r.name] = Number(r.delb_rate) || 0;
  return map;
}

export async function setWorkerRate(db: SQLiteDatabase, workerId: number, name: string, rate: number): Promise<void> {
  await db.runAsync(`INSERT INTO worker_rates (worker_id, name, delb_rate) VALUES (?, ?, ?)
                     ON CONFLICT(worker_id, name) DO UPDATE SET delb_rate=excluded.delb_rate`, [workerId, name, rate]);
}

export async function setWorkerDbRate(db: SQLiteDatabase, workerId: number, name: string, dbRate: number): Promise<void> {
  await db.runAsync(`INSERT INTO worker_rates (worker_id, name, db_rate) VALUES (?, ?, ?)
                     ON CONFLICT(worker_id, name) DO UPDATE SET db_rate=excluded.db_rate`, [workerId, name, dbRate]);
}

export async function getWorkerDbRates(db: SQLiteDatabase, workerId: number): Promise<Record<string, number>> {
  const rows = await db.getAllAsync<{ name: string; db_rate: number | null }>(`SELECT name, db_rate FROM worker_rates WHERE worker_id = ?`, [workerId]);
  const map: Record<string, number> = {};
  for (const r of rows) {
    // Handle null values properly - if db_rate is null, use 0
    const rate = r.db_rate !== null && r.db_rate !== undefined ? Number(r.db_rate) : 0;
    map[r.name] = isNaN(rate) ? 0 : rate;
  }
  console.log(`[getWorkerDbRates] Loaded ${Object.keys(map).length} rates for worker ${workerId}:`, map);
  return map;
}

// Apply rates to all workers, but only if they don't already have a specific rate
export async function applyRateToAllWorkers(db: SQLiteDatabase, workerIds: number[], name: string, rate: number, preserveExisting: boolean = true): Promise<void> {
  for (const workerId of workerIds) {
    if (preserveExisting) {
      // Check if worker already has a rate for this SKU
      const existing = await db.getAllAsync<{ delb_rate: number }>(
        `SELECT delb_rate FROM worker_rates WHERE worker_id = ? AND name = ?`,
        [workerId, name]
      );
      // Only apply if no existing rate
      if (existing.length === 0) {
        await setWorkerRate(db, workerId, name, rate);
      }
    } else {
      // Apply to all workers regardless
      await setWorkerRate(db, workerId, name, rate);
    }
  }
}

// Apply DB rates to all workers, but only if they don't already have a specific rate
export async function applyDbRateToAllWorkers(db: SQLiteDatabase, workerIds: number[], name: string, dbRate: number, preserveExisting: boolean = true): Promise<void> {
  for (const workerId of workerIds) {
    if (preserveExisting) {
      // Check if worker already has a DB rate for this SKU
      const existing = await db.getAllAsync<{ db_rate: number | null }>(
        `SELECT db_rate FROM worker_rates WHERE worker_id = ? AND name = ?`,
        [workerId, name]
      );
      // Only apply if no existing rate (or if existing rate is null/0)
      if (existing.length === 0 || existing[0].db_rate === null || existing[0].db_rate === 0) {
        await setWorkerDbRate(db, workerId, name, dbRate);
      }
    } else {
      // Apply to all workers regardless
      await setWorkerDbRate(db, workerId, name, dbRate);
    }
  }
}

export async function getSkuSequence(db: SQLiteDatabase): Promise<Array<{ name: string; seq: number }>> {
  return await db.getAllAsync(`SELECT name, seq FROM sku_sequence ORDER BY seq ASC`);
}

export async function setSkuSequence(db: SQLiteDatabase, name: string, seq: number): Promise<void> {
  await db.runAsync(`INSERT INTO sku_sequence (name, seq) VALUES (?, ?)
                     ON CONFLICT(name) DO UPDATE SET seq=excluded.seq`, [name, seq]);
}

// Clean up inconsistent SKU names in the database
export async function cleanupSkuNames(db: SQLiteDatabase): Promise<void> {
  // Define the mapping from old names to standardized names
  const skuNameMapping: Record<string, string> = {
    'BR200': 'BR 200',
    'MG200': 'MG 200'
  };

  // Define SKU names to completely remove from the database
  const skuNamesToRemove = [
    'VV 250',
    'VV 450', 
    'VV350',
    'AT 400',
    'BUM70',
    'AK',
    'MK',
    'BUR200',
    'BUR190',
    'PAV250',
    'GAP300',
    'B.BRW250',
    'V450',
    'CHD50',
    'MP150',
    'W D/DRY'
  ];

  await db.runAsync('BEGIN');
  try {
    // First, handle name mapping (rename old names to standardized names)
    for (const [oldName, newName] of Object.entries(skuNameMapping)) {
      // Check if old name exists
      const oldEntry = await db.getAllAsync(`SELECT * FROM sku_sequence WHERE name = ?`, [oldName]);
      if (oldEntry.length > 0) {
        // Check if new name already exists
        const newEntry = await db.getAllAsync(`SELECT * FROM sku_sequence WHERE name = ?`, [newName]);
        if (newEntry.length > 0) {
          // If both exist, keep the one with higher sequence number
          const oldSeq = (oldEntry[0] as any).seq;
          const newSeq = (newEntry[0] as any).seq;
          if (oldSeq > newSeq) {
            await db.runAsync(`UPDATE sku_sequence SET name = ? WHERE name = ?`, [newName, oldName]);
          } else {
            await db.runAsync(`DELETE FROM sku_sequence WHERE name = ?`, [oldName]);
          }
        } else {
          // Update old name to new name
          await db.runAsync(`UPDATE sku_sequence SET name = ? WHERE name = ?`, [newName, oldName]);
        }
      }
    }

    // Second, remove unwanted SKU names completely from all tables
    for (const skuName of skuNamesToRemove) {
      // Remove from sku_sequence table
      await db.runAsync(`DELETE FROM sku_sequence WHERE name = ?`, [skuName]);
      
      // Remove from worker_rates table
      await db.runAsync(`DELETE FROM worker_rates WHERE name = ?`, [skuName]);
      
      // Remove from main_table_data table
      await db.runAsync(`DELETE FROM main_table_data WHERE sku_name = ?`, [skuName]);
      
      // Remove from order_totals table
      await db.runAsync(`DELETE FROM order_totals WHERE name = ?`, [skuName]);
      
      // Remove from extra_orders table
      await db.runAsync(`DELETE FROM extra_orders WHERE sku_name = ?`, [skuName]);
      
      // Remove from remark_plus_data table
      await db.runAsync(`DELETE FROM remark_plus_data WHERE sku_name = ?`, [skuName]);
      
      // Remove from submission_lines table
      await db.runAsync(`DELETE FROM submission_lines WHERE name = ?`, [skuName]);
    }

    // Third, handle remaining name mappings for worker_rates and other tables
    for (const [oldName, newName] of Object.entries(skuNameMapping)) {
      await db.runAsync(`UPDATE worker_rates SET name = ? WHERE name = ?`, [newName, oldName]);
      await db.runAsync(`UPDATE main_table_data SET sku_name = ? WHERE sku_name = ?`, [newName, oldName]);
      await db.runAsync(`UPDATE order_totals SET name = ? WHERE name = ?`, [newName, oldName]);
      await db.runAsync(`UPDATE extra_orders SET sku_name = ? WHERE sku_name = ?`, [newName, oldName]);
      await db.runAsync(`UPDATE remark_plus_data SET sku_name = ? WHERE sku_name = ?`, [newName, oldName]);
      await db.runAsync(`UPDATE submission_lines SET name = ? WHERE name = ?`, [newName, oldName]);
    }

    await db.runAsync('COMMIT');
  } catch (e) {
    await db.runAsync('ROLLBACK');
    throw e;
  }
}


