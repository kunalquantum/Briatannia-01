import type { SQLiteDatabase } from 'expo-sqlite';

export type SubmissionInput = {
	userId: number;
	location?: string | null;
	forDate: string; // YYYY-MM-DD
	dayOfWeek?: string; // Day of week (Monday, Tuesday, etc.)
	Totals: { sku: number; mr: number; fr: number; sale: number; amount: number };
	Payments: { cash: number; online: number; previousBalance: number; totalDue: number; remainingDue: number };
	Lines: Array<{ name: string; sku?: number; mr?: number; fr?: number; delbRate?: number; sale?: number; amount?: number; order?: string }>;
};

export async function insertSubmission(db: SQLiteDatabase, input: SubmissionInput): Promise<number> {
	await db.runAsync('BEGIN');
	try {
		const res = await db.runAsync(
			`INSERT INTO submissions (user_id, location, for_date, day_of_week, total_sku, total_mr, total_fr, total_sale, total_amount, cash, online, previous_balance, total_due, remaining_due, status)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
			[
				input.userId,
				input.location ?? null,
				input.forDate,
				input.dayOfWeek ?? null,
				input.Totals.sku,
				input.Totals.mr,
				input.Totals.fr,
				input.Totals.sale,
				input.Totals.amount,
				input.Payments.cash,
				input.Payments.online,
				input.Payments.previousBalance,
				input.Payments.totalDue,
				input.Payments.remainingDue,
			]
		);
		// @ts-ignore - expo-sqlite returns lastInsertRowId on runAsync
		const submissionId: number = res.lastInsertRowId ?? res.insertId;
		for (const line of input.Lines) {
			await db.runAsync(
				`INSERT INTO submission_lines (submission_id, name, sku, mr, fr, delb_rate, sale, amount, ordering) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					submissionId,
					line.name,
					line.sku ?? null,
					line.mr ?? null,
					line.fr ?? null,
					line.delbRate ?? null,
					line.sale ?? null,
					line.amount ?? null,
					line.order ?? null,
				]
			);
		}
		await db.runAsync('COMMIT');
		
		// Sync worker orders to Admin Orders table
		try {
			await syncWorkerOrdersToAdminTable(db, input.forDate, input.location, input.Lines);
		} catch (syncError) {
			console.error('Failed to sync worker orders to Admin Orders table:', syncError);
			// Don't fail the submission if sync fails
		}
		
		return submissionId;
	} catch (e) {
		await db.runAsync('ROLLBACK');
		throw e;
	}
}

export async function getSubmissionLinesForDate(
    db: SQLiteDatabase,
    userId: number,
    forDate: string
): Promise<Array<{ name: string; ordering: string | null }>> {
    return await db.getAllAsync(
        `SELECT sl.name as name, sl.ordering as ordering
         FROM submissions s
         JOIN submission_lines sl ON sl.submission_id = s.id
         WHERE s.user_id = ? AND s.for_date = ?`,
        [userId, forDate]
    );
}

export async function findSubmissionId(
    db: SQLiteDatabase,
    userId: number,
    forDate: string
): Promise<number | null> {
    const rows = await db.getAllAsync<{ id: number }>(`SELECT id FROM submissions WHERE user_id = ? AND for_date = ? LIMIT 1`, [userId, forDate]);
    return rows[0]?.id ?? null;
}

export async function createEmptySubmission(
    db: SQLiteDatabase,
    userId: number,
    forDate: string,
    location?: string | null
): Promise<number> {
    const res = await db.runAsync(
        `INSERT INTO submissions (user_id, location, for_date, status) VALUES (?, ?, ?, 'pending')`,
        [userId, location ?? null, forDate]
    );
    // @ts-ignore
    return res.lastInsertRowId ?? res.insertId;
}

export async function upsertSubmissionLineOrdering(
    db: SQLiteDatabase,
    submissionId: number,
    name: string,
    ordering: number
): Promise<void> {
    const existing = await db.getAllAsync<{ id: number }>(
        `SELECT id FROM submission_lines WHERE submission_id = ? AND name = ? LIMIT 1`,
        [submissionId, name]
    );
    if (existing[0]?.id) {
        await db.runAsync(`UPDATE submission_lines SET ordering = ? WHERE id = ?`, [ordering, existing[0].id]);
    } else {
        await db.runAsync(
            `INSERT INTO submission_lines (submission_id, name, ordering) VALUES (?, ?, ?)`,
            [submissionId, name, ordering]
        );
    }
}

export async function fetchWorkerOrdersForDate(
    db: SQLiteDatabase,
    forDate: string
): Promise<Array<{ user_id: number; worker: string; name: string; ordering: number | null; submission_id: number }>> {
    return await db.getAllAsync(
        `SELECT u.id as user_id, COALESCE(u.location, u.username) as worker, sl.name as name, sl.ordering as ordering, s.id as submission_id
         FROM submissions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN submission_lines sl ON sl.submission_id = s.id
         WHERE s.for_date = ? AND u.role = 'worker'`,
        [forDate]
    );
}

export type PendingSubmission = {
    id: number;
    user_id: number;
    worker: string;
    for_date: string;
    total_amount: number;
    cash: number;
    online: number;
    total_due: number;
    remaining_due: number;
};

export async function fetchPendingSubmissions(db: SQLiteDatabase): Promise<PendingSubmission[]> {
    return await db.getAllAsync<PendingSubmission>(
        `SELECT s.id, s.user_id, COALESCE(u.location, u.username) as worker, s.for_date, s.total_amount, s.cash, s.online, s.total_due, s.remaining_due
         FROM submissions s JOIN users u ON u.id = s.user_id
         WHERE s.status = 'pending'
         ORDER BY s.for_date DESC, worker ASC`
    );
}

export async function fetchPendingCount(db: SQLiteDatabase): Promise<number> {
    const rows = await db.getAllAsync<{ c: number }>(`SELECT COUNT(1) as c FROM submissions WHERE status = 'pending'`);
    return rows[0]?.c ?? 0;
}

export async function approveSubmission(db: SQLiteDatabase, id: number): Promise<void> {
    await db.runAsync(`UPDATE submissions SET status = 'approved' WHERE id = ?`, [id]);
}

export async function updateSubmissionPayments(
    db: SQLiteDatabase,
    id: number,
    cash: number,
    online: number,
    remainingDue: number
): Promise<void> {
    await db.runAsync(`UPDATE submissions SET cash = ?, online = ?, remaining_due = ? WHERE id = ?`, [cash, online, remainingDue, id]);
}

export type SubmissionLine = {
    id: number;
    name: string;
    sku: number | null;
    mr: number | null;
    fr: number | null;
    delb_rate: number | null;
    sale: number | null;
    amount: number | null;
    ordering: string | null;
};

export async function fetchSubmissionLines(db: SQLiteDatabase, submissionId: number): Promise<SubmissionLine[]> {
    return await db.getAllAsync<SubmissionLine>(
        `SELECT id, name, sku, mr, fr, delb_rate, sale, amount, ordering FROM submission_lines WHERE submission_id = ?`,
        [submissionId]
    );
}

export async function upsertSubmissionLineFull(
    db: SQLiteDatabase,
    submissionId: number,
    line: { name: string; sku?: number; mr?: number; fr?: number; delb_rate?: number; sale?: number; amount?: number; ordering?: string | null }
): Promise<void> {
    const existing = await db.getAllAsync<{ id: number }>(
        `SELECT id FROM submission_lines WHERE submission_id = ? AND name = ? LIMIT 1`,
        [submissionId, line.name]
    );
    if (existing[0]?.id) {
        await db.runAsync(
            `UPDATE submission_lines SET sku = ?, mr = ?, fr = ?, delb_rate = ?, sale = ?, amount = ?, ordering = ? WHERE id = ?`,
            [line.sku ?? null, line.mr ?? null, line.fr ?? null, line.delb_rate ?? null, line.sale ?? null, line.amount ?? null, line.ordering ?? null, existing[0].id]
        );
    } else {
        await db.runAsync(
            `INSERT INTO submission_lines (submission_id, name, sku, mr, fr, delb_rate, sale, amount, ordering) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [submissionId, line.name, line.sku ?? null, line.mr ?? null, line.fr ?? null, line.delb_rate ?? null, line.sale ?? null, line.amount ?? null, line.ordering ?? null]
        );
    }
}

export async function updateSubmissionTotals(
    db: SQLiteDatabase,
    id: number,
    totals: { sku: number; mr: number; fr: number; sale: number; amount: number }
): Promise<void> {
    await db.runAsync(
        `UPDATE submissions SET total_sku = ?, total_mr = ?, total_fr = ?, total_sale = ?, total_amount = ? WHERE id = ?`,
        [totals.sku, totals.mr, totals.fr, totals.sale, totals.amount, id]
    );
}

export type TotalsRow = {
    name: string;
    t_sku: number;
    t_mr: number;
    t_fr: number;
    t_sale: number;
    amount: number;
};

export async function fetchApprovedTotalsBySku(db: SQLiteDatabase, forDate?: string | null): Promise<TotalsRow[]> {
    const params: any[] = [];
    let where = `s.status = 'approved'`;
    if (forDate) {
        where += ` AND s.for_date = ?`;
        params.push(forDate);
    }
    return await db.getAllAsync<TotalsRow>(
        `SELECT sl.name as name,
                COALESCE(SUM(sl.sku),0)  as t_sku,
                COALESCE(SUM(sl.mr),0)   as t_mr,
                COALESCE(SUM(sl.fr),0)   as t_fr,
                COALESCE(SUM(sl.sale),0) as t_sale,
                COALESCE(SUM(sl.amount),0) as amount
         FROM submissions s
         JOIN submission_lines sl ON sl.submission_id = s.id
         WHERE ${where}
         GROUP BY sl.name`
        , params
    );
}

export async function fetchSubmissionsInRange(
    db: SQLiteDatabase,
    startIso: string,
    endIso: string
): Promise<Array<any>> {
    return await db.getAllAsync(
        `SELECT s.*, COALESCE(u.location, u.username) as worker
         FROM submissions s JOIN users u ON u.id = s.user_id
         WHERE s.for_date BETWEEN ? AND ?
         ORDER BY s.for_date ASC, worker ASC`,
        [startIso, endIso]
    );
}

export async function fetchTodaySubmissionStatus(db: SQLiteDatabase, forDate: string): Promise<Array<{ id: number; worker: string; submitted: number }>> {
    return await db.getAllAsync(
        `SELECT u.id, COALESCE(u.location,u.username) as worker,
                CASE WHEN EXISTS(SELECT 1 FROM submissions s WHERE s.user_id = u.id AND s.for_date = ?) THEN 1 ELSE 0 END as submitted
         FROM users u WHERE u.role = 'worker' ORDER BY worker`, [forDate]
    );
}

export async function clearPendingSubmissions(db: SQLiteDatabase, forDate?: string | null): Promise<void> {
    await db.runAsync('BEGIN');
    try {
        if (forDate) {
            await db.runAsync(`DELETE FROM submission_lines WHERE submission_id IN (SELECT id FROM submissions WHERE status='pending' AND for_date = ?)`, [forDate]);
            await db.runAsync(`DELETE FROM submissions WHERE status='pending' AND for_date = ?`, [forDate]);
        } else {
            await db.runAsync(`DELETE FROM submission_lines WHERE submission_id IN (SELECT id FROM submissions WHERE status='pending')`);
            await db.runAsync(`DELETE FROM submissions WHERE status='pending'`);
        }
        await db.runAsync('COMMIT');
    } catch (e) {
        await db.runAsync('ROLLBACK');
        throw e;
    }
}

export async function fetchDetailedSubmissionForApproval(
    db: SQLiteDatabase, 
    submissionId: number
): Promise<Array<{
    sku_name: string;
    mrp: number;
    aw_rate: number;
    retail_rate: number;
    db_rate: number;
    shop_com: number;
    db_com: number;
    self: number;
    sku: number;
    mr: number;
    fr: number;
    sale: number;
    mr_value: number;
    fr_value: number;
    sale_amount: number;
    percentage: number;
}>> {
    return await db.getAllAsync(
        `SELECT 
            sl.name as sku_name,
            COALESCE(sl.mr, 0) as mrp,
            COALESCE(sl.fr, 0) as aw_rate,
            COALESCE(sl.delb_rate, 0) as retail_rate,
            COALESCE(sl.delb_rate, 0) as db_rate,
            0 as shop_com,
            0 as db_com,
            0 as self,
            COALESCE(sl.sku, 0) as sku,
            COALESCE(sl.mr, 0) as mr,
            COALESCE(sl.fr, 0) as fr,
            COALESCE(sl.sale, 0) as sale,
            COALESCE(sl.mr * sl.sku, 0) as mr_value,
            COALESCE(sl.fr * sl.sku, 0) as fr_value,
            COALESCE(sl.amount, 0) as sale_amount,
            CASE 
                WHEN sl.sale > 0 THEN ROUND((sl.amount / sl.sale) * 100, 2)
                ELSE 0 
            END as percentage
        FROM submission_lines sl 
        WHERE sl.submission_id = ?
        ORDER BY sl.ordering, sl.name`,
        [submissionId]
    );
}

export async function expireOldPending(db: SQLiteDatabase, beforeDateIso: string): Promise<void> {
    await db.runAsync('BEGIN');
    try {
        await db.runAsync(`DELETE FROM submission_lines WHERE submission_id IN (SELECT id FROM submissions WHERE status='pending' AND for_date < ?)`, [beforeDateIso]);
        await db.runAsync(`DELETE FROM submissions WHERE status='pending' AND for_date < ?`, [beforeDateIso]);
        await db.runAsync('COMMIT');
    } catch (e) {
        await db.runAsync('ROLLBACK');
        throw e;
    }
}

export type MrRankingRow = {
    user_id: number;
    worker: string;
    mr_total: number;
    sku_total: number;
    mr_percent: number;
};

export async function fetchMrRanking(db: SQLiteDatabase, forDate?: string | null): Promise<MrRankingRow[]> {
    const params: any[] = [];
    let where = `s.status = 'approved'`;
    if (forDate) { where += ` AND s.for_date = ?`; params.push(forDate); }
    const rows = await db.getAllAsync<MrRankingRow>(
        `SELECT u.id as user_id, COALESCE(u.location,u.username) as worker,
                COALESCE(SUM(sl.mr),0) as mr_total,
                COALESCE(SUM(sl.sku),0) as sku_total,
                CASE WHEN COALESCE(SUM(sl.sku),0) = 0 THEN 0.0
                     ELSE (CAST(SUM(sl.mr) AS REAL) / CAST(SUM(sl.sku) AS REAL)) * 100.0 END as mr_percent
         FROM submissions s
         JOIN users u ON u.id = s.user_id
         JOIN submission_lines sl ON sl.submission_id = s.id
         WHERE ${where}
         GROUP BY u.id, worker
         ORDER BY mr_percent ASC, worker ASC`,
        params
    );
    return rows;
}

export async function upsertOrderTotal(
    db: SQLiteDatabase,
    forDate: string,
    name: string,
    totalQty: number,
    carryover: number
): Promise<void> {
    // Get day of week from date
    const date = new Date(forDate);
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
    
    await db.runAsync(
        `INSERT INTO order_totals (for_date, day_of_week, name, total_qty, carryover) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(for_date, name) DO UPDATE SET total_qty = excluded.total_qty, carryover = excluded.carryover, day_of_week = excluded.day_of_week`,
        [forDate, dayOfWeek, name, totalQty, carryover]
    );
}

export async function getCarryoverForDate(db: SQLiteDatabase, forDate: string): Promise<Record<string, number>> {
    const prev = new Date(forDate);
    prev.setDate(prev.getDate() - 1);
    const y = prev.toISOString().slice(0,10);
    const rows = await db.getAllAsync<{ name: string; carryover: number }>(`SELECT name, carryover FROM order_totals WHERE for_date = ?`, [y]);
    const map: Record<string, number> = {};
    rows.forEach(r => { map[r.name] = Number(r.carryover) || 0; });
    return map;
}

export async function fetchOrderTotalsByDate(db: SQLiteDatabase, forDate: string): Promise<Record<string, number>> {
    const rows = await db.getAllAsync<{ name: string; total_qty: number }>(
        `SELECT name, total_qty FROM order_totals WHERE for_date = ?`,
        [forDate]
    );
    const map: Record<string, number> = {};
    rows.forEach(r => { map[r.name] = Number(r.total_qty) || 0; });
    return map;
}

export async function fetchLinesForSubmission(db: SQLiteDatabase, submissionId: number): Promise<any[]> {
    return await db.getAllAsync(`SELECT * FROM submission_lines WHERE submission_id = ?`, [submissionId]);
}

export async function getYesterdayRemarkPlusData(db: SQLiteDatabase): Promise<Record<string, number>> {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toISOString().slice(0, 10);
    
    // Get yesterday's remark + data directly from the remark_plus_data table
    const rows = await db.getAllAsync<{ sku_name: string; remark_plus_value: number }>(
        `SELECT sku_name, remark_plus_value FROM remark_plus_data WHERE date = ?`,
        [yesterdayDate]
    );
    
    const remarkPlusData: Record<string, number> = {};
    
    for (const row of rows) {
        if (row.remark_plus_value > 0) {
            remarkPlusData[row.sku_name] = Number(row.remark_plus_value);
        }
    }
    
    return remarkPlusData;
}

// Location mapping helper - maps user-friendly location names to Admin Orders column keys
function mapLocationToColumnKey(location: string | null | undefined): string | null {
    if (!location) return null;
    
    const normalizedLocation = location.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    
    const locationMap: Record<string, string> = {
        'prabhadevi_1': 'prabhadevi_1',
        'prabhadevi1': 'prabhadevi_1',
        'prabhadevi_2': 'prabhadevi_2', 
        'prabhadevi2': 'prabhadevi_2',
        'parel': 'parel',
        'saat_rasta': 'saat_rasta',
        'saatrasta': 'saat_rasta',
        'sea_face': 'sea_face',
        'seaface': 'sea_face',
        'worli_bdd': 'worli_bdd',
        'worlibdd': 'worli_bdd',
        'worli_mix': 'worli_mix',
        'worlimix': 'worli_mix',
        'matunga': 'matunga',
        'mahim': 'mahim',
        'koli_wada': 'koli_wada',
        'koliwada': 'koli_wada'
    };
    
    return locationMap[normalizedLocation] || null;
}

// Sync worker orders to Admin Orders table
export async function syncWorkerOrdersToAdminTable(
    db: SQLiteDatabase,
    forDate: string,
    location: string | null | undefined,
    lines: Array<{ name: string; order?: string }>
): Promise<void> {
    if (!location) {
        console.warn('No location provided for worker order sync');
        return;
    }
    
    const columnKey = mapLocationToColumnKey(location);
    if (!columnKey) {
        console.warn(`Location "${location}" does not map to any Admin Orders column`);
        return;
    }
    
    console.log(`Syncing worker orders for location "${location}" (${columnKey}) on ${forDate}`);
    
    try {
        // Process each SKU with an order value
        for (const line of lines) {
            if (!line.order || line.order.trim() === '') continue;
            
            const orderValue = Number(line.order) || 0;
            if (orderValue <= 0) continue;
            
            console.log(`Syncing ${line.name}: order=${line.order} -> ${columnKey}=${orderValue}`);
            
            // Insert or update the location order for this SKU
            await db.runAsync(
                `INSERT INTO location_orders (for_date, sku_name, ${columnKey}) VALUES (?, ?, ?)
                 ON CONFLICT(for_date, sku_name) DO UPDATE SET ${columnKey} = excluded.${columnKey}`,
                [forDate, line.name, orderValue]
            );
        }
        
        console.log(`Successfully synced worker orders to Admin Orders table`);
    } catch (error) {
        console.error('Error syncing worker orders to Admin Orders table:', error);
        // Don't throw - this shouldn't break the submission
    }
}

// Load location orders for Admin Orders table
export async function fetchLocationOrdersForDate(
    db: SQLiteDatabase, 
    forDate: string
): Promise<Array<{
    sku_name: string;
    prabhadevi_1: number;
    prabhadevi_2: number;
    parel: number;
    saat_rasta: number;
    sea_face: number;
    worli_bdd: number;
    worli_mix: number;
    matunga: number;
    mahim: number;
    koli_wada: number;
    previous_balance: number;
}>> {
    return await db.getAllAsync(
        `SELECT sku_name, prabhadevi_1, prabhadevi_2, parel, saat_rasta, sea_face, 
                worli_bdd, worli_mix, matunga, mahim, koli_wada, previous_balance
         FROM location_orders 
         WHERE for_date = ?`,
        [forDate]
    );
}

// Update location order for a specific SKU and location
export async function updateLocationOrder(
    db: SQLiteDatabase,
    forDate: string,
    skuName: string,
    locationColumn: string,
    orderValue: number
): Promise<void> {
    await db.runAsync(
        `INSERT INTO location_orders (for_date, sku_name, ${locationColumn}) VALUES (?, ?, ?)
         ON CONFLICT(for_date, sku_name) DO UPDATE SET ${locationColumn} = excluded.${locationColumn}`,
        [forDate, skuName, orderValue]
    );
}

// Get all location columns
export const LOCATION_COLUMNS = [
    'prabhadevi_1', 'prabhadevi_2', 'parel', 'saat_rasta', 'sea_face', 
    'worli_bdd', 'worli_mix', 'matunga', 'mahim', 'koli_wada'
];

// Sync admin orders to worker SKU values
export async function syncAdminOrdersToWorkerSku(
    db: SQLiteDatabase,
    forDate: string,
    location: string | null | undefined
): Promise<void> {
    if (!location) {
        console.warn('No location provided for admin order sync');
        return;
    }
    
    const columnKey = mapLocationToColumnKey(location);
    if (!columnKey) {
        console.warn(`Location "${location}" does not map to any Admin Orders column`);
        return;
    }
    
    console.log(`Syncing admin orders to worker SKU for location "${location}" (${columnKey}) on ${forDate}`);
    
    try {
        // Get the latest order quantities from location_orders table
        const locationOrders = await db.getAllAsync<{sku_name: string, [key: string]: any}>(
            `SELECT sku_name, ${columnKey} FROM location_orders WHERE for_date = ?`,
            [forDate]
        );
        
        // Update worker SKU values based on admin orders
        for (const order of locationOrders) {
            const skuValue = order[columnKey] || 0;
            if (skuValue > 0) {
                console.log(`Updating worker SKU for ${order.sku_name}: ${skuValue}`);
                
                // Update the submission_lines table for this worker's location
                await db.runAsync(
                    `UPDATE submission_lines 
                     SET sku = ? 
                     WHERE submission_id IN (
                         SELECT id FROM submissions 
                         WHERE location = ? AND for_date = ?
                     ) AND name = ?`,
                    [skuValue, location, forDate, order.sku_name]
                );
            }
        }
        
        console.log(`Successfully synced admin orders to worker SKU values`);
    } catch (error) {
        console.error('Error syncing admin orders to worker SKU:', error);
    }
}

// Update location order and sync to worker SKU
export async function updateLocationOrderWithSync(
    db: SQLiteDatabase,
    forDate: string,
    skuName: string,
    location: string,
    quantity: number
): Promise<void> {
    const columnKey = mapLocationToColumnKey(location);
    if (!columnKey) return;
    
    // Get day of week from date
    const date = new Date(forDate);
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
    
    // Update location_orders table
    await db.runAsync(
        `INSERT INTO location_orders (for_date, day_of_week, sku_name, ${columnKey}) VALUES (?, ?, ?, ?)
         ON CONFLICT(for_date, sku_name) DO UPDATE SET ${columnKey} = excluded.${columnKey}, day_of_week = excluded.day_of_week`,
        [forDate, dayOfWeek, skuName, quantity]
    );
    
    // Immediately sync to worker SKU values
    await syncAdminOrdersToWorkerSku(db, forDate, location);
}

// Get admin orders for a specific location and date
export async function getAdminOrdersForLocation(
    db: SQLiteDatabase,
    forDate: string,
    location: string
): Promise<Record<string, number>> {
    const columnKey = mapLocationToColumnKey(location);
    if (!columnKey) return {};
    
    const orders = await db.getAllAsync<{sku_name: string, [key: string]: any}>(
        `SELECT sku_name, ${columnKey} FROM location_orders WHERE for_date = ?`,
        [forDate]
    );
    
    const result: Record<string, number> = {};
    for (const order of orders) {
        result[order.sku_name] = order[columnKey] || 0;
    }
    
    return result;
}

// Helper function to get location from column key
export function getLocationFromColumnKey(columnKey: string): string | null {
    const locationMap: Record<string, string> = {
        'prabhadevi_1': 'PRABHADEVI 1',
        'prabhadevi_2': 'PRABHADEVI 2',
        'parel': 'PAREL',
        'saat_rasta': 'SAAT RASTA',
        'sea_face': 'SEA FACE',
        'worli_bdd': 'WORLI B.D.D',
        'worli_mix': 'WORLI MIX',
        'matunga': 'MATUNGA',
        'mahim': 'MAHIM',
        'koli_wada': 'KOLI WADA'
    };
    
    return locationMap[columnKey] || null;
}


