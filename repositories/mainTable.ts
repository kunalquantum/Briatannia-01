import type { SQLiteDatabase } from 'expo-sqlite';

export type MainTableData = {
    sku_name: string;
    jali: number;
    jali_qua: number;
    previous_qua: number;
    total_qua: number;
};

export async function saveMainTableData(
    db: SQLiteDatabase,
    data: MainTableData
): Promise<void> {
    await db.runAsync(
        `INSERT INTO main_table_data (sku_name, jali, jali_qua, previous_qua, total_qua) 
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(sku_name) DO UPDATE SET 
         jali = excluded.jali,
         jali_qua = excluded.jali_qua,
         previous_qua = excluded.previous_qua,
         total_qua = excluded.total_qua,
         updated_at = (strftime('%s','now'))`,
        [data.sku_name, data.jali, data.jali_qua, data.previous_qua, data.total_qua]
    );
}

export async function loadMainTableData(
    db: SQLiteDatabase
): Promise<Record<string, MainTableData>> {
    const rows = await db.getAllAsync<MainTableData>(
        `SELECT sku_name, jali, jali_qua, previous_qua, total_qua FROM main_table_data`
    );
    
    const dataMap: Record<string, MainTableData> = {};
    for (const row of rows) {
        dataMap[row.sku_name] = {
            sku_name: row.sku_name,
            jali: Number(row.jali) || 0,
            jali_qua: Number(row.jali_qua) || 0,
            previous_qua: Number(row.previous_qua) || 0,
            total_qua: Number(row.total_qua) || 0,
        };
    }
    
    return dataMap;
}

export async function saveAllMainTableData(
    db: SQLiteDatabase,
    dataArray: MainTableData[]
): Promise<void> {
    await db.runAsync('BEGIN');
    try {
        for (const data of dataArray) {
            await saveMainTableData(db, data);
        }
        await db.runAsync('COMMIT');
    } catch (e) {
        await db.runAsync('ROLLBACK');
        throw e;
    }
}
