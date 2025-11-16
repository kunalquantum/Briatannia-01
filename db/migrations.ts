import type { SQLiteDatabase } from 'expo-sqlite';

// Database initialization and migrations
export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
	// Enable Write-Ahead Logging for better concurrency and reliability
	await db.execAsync('PRAGMA journal_mode = WAL;');

	// Create tables if they do not exist
	await db.execAsync(`
		CREATE TABLE IF NOT EXISTS todos (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL,
			done INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
		);

		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL CHECK (role IN ('worker','supervisor','admin')),
			location TEXT,
			created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
		);

		CREATE TABLE IF NOT EXISTS submissions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			location TEXT,
			for_date TEXT NOT NULL, -- YYYY-MM-DD
			total_sku REAL DEFAULT 0,
			total_mr REAL DEFAULT 0,
			total_fr REAL DEFAULT 0,
			total_sale REAL DEFAULT 0,
			total_amount REAL DEFAULT 0,
			cash REAL DEFAULT 0,
			online REAL DEFAULT 0,
			previous_balance REAL DEFAULT 0,
			total_due REAL DEFAULT 0,
			remaining_due REAL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved')),
			created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
			FOREIGN KEY(user_id) REFERENCES users(id)
		);

		CREATE TABLE IF NOT EXISTS submission_lines (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			submission_id INTEGER NOT NULL,
			name TEXT,
			sku REAL,
			mr REAL,
			fr REAL,
			delb_rate REAL,
			sale REAL,
			amount REAL,
			ordering TEXT,
			FOREIGN KEY(submission_id) REFERENCES submissions(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS worker_rates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			worker_id INTEGER NOT NULL,
			name TEXT NOT NULL, -- SKU NAME
			delb_rate REAL NOT NULL DEFAULT 0,
			UNIQUE(worker_id, name),
			FOREIGN KEY(worker_id) REFERENCES users(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS sku_sequence (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			seq INTEGER NOT NULL DEFAULT 0
		);

		-- best-effort schema evolution: add last_login to users if missing
	`);

	try {
		await db.execAsync(`ALTER TABLE users ADD COLUMN last_login INTEGER`);
	} catch (e) {
		// ignore if column already exists
	}

	// Add password column to users table for debugging (stores plain text password)
	try {
		await db.execAsync(`ALTER TABLE users ADD COLUMN password TEXT`);
	} catch (e) {
		// ignore if column already exists
	}

	// Add db_rate column to worker_rates table if it doesn't exist
	try {
		// Check if column exists first
		const columns = await db.getAllAsync(`PRAGMA table_info(worker_rates)`);
		const hasDbRateColumn = columns.some((col: any) => col.name === 'db_rate');
		
		if (!hasDbRateColumn) {
			await db.execAsync(`ALTER TABLE worker_rates ADD COLUMN db_rate REAL DEFAULT 0`);
		}
	} catch (e) {
		console.log('Error adding db_rate column:', e);
		// ignore if column already exists or other errors
	}

	// Orders totals and carryover per date/SKU
	await db.execAsync(`CREATE TABLE IF NOT EXISTS order_totals (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		for_date TEXT NOT NULL,
		name TEXT NOT NULL,
		total_qty REAL NOT NULL DEFAULT 0,
		carryover REAL NOT NULL DEFAULT 0,
		UNIQUE(for_date, name)
	);`);

	// Extra orders for carryover to next day's previous balance
	await db.execAsync(`CREATE TABLE IF NOT EXISTS extra_orders (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		date TEXT NOT NULL,
		sku_name TEXT NOT NULL,
		extra_order REAL NOT NULL DEFAULT 0,
		UNIQUE(date, sku_name)
	);`);

	// Main table data storage for Tray, Tray Quantity, Prev, Total
	await db.execAsync(`CREATE TABLE IF NOT EXISTS main_table_data (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		sku_name TEXT NOT NULL,
		jali REAL NOT NULL DEFAULT 0,
		jali_qua REAL NOT NULL DEFAULT 0,
		previous_qua REAL NOT NULL DEFAULT 0,
		total_qua REAL NOT NULL DEFAULT 0,
		updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
		UNIQUE(sku_name)
	);`);

	// Remark + data storage for carryover to tomorrow's previous column
	await db.execAsync(`CREATE TABLE IF NOT EXISTS remark_plus_data (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		date TEXT NOT NULL,
		sku_name TEXT NOT NULL,
		remark_plus_value REAL NOT NULL DEFAULT 0,
		UNIQUE(date, sku_name)
	);`);

	// Location-specific orders for Admin Orders table
	await db.execAsync(`CREATE TABLE IF NOT EXISTS location_orders (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		for_date TEXT NOT NULL,
		day_of_week TEXT,
		sku_name TEXT NOT NULL,
		prabhadevi_1 REAL NOT NULL DEFAULT 0,
		prabhadevi_2 REAL NOT NULL DEFAULT 0,
		parel REAL NOT NULL DEFAULT 0,
		saat_rasta REAL NOT NULL DEFAULT 0,
		sea_face REAL NOT NULL DEFAULT 0,
		worli_bdd REAL NOT NULL DEFAULT 0,
		worli_mix REAL NOT NULL DEFAULT 0,
		matunga REAL NOT NULL DEFAULT 0,
		mahim REAL NOT NULL DEFAULT 0,
		koli_wada REAL NOT NULL DEFAULT 0,
		previous_balance REAL NOT NULL DEFAULT 0,
		UNIQUE(for_date, sku_name)
	);`);

	// Add day_of_week column to existing tables if they don't exist
	try {
		await db.execAsync(`ALTER TABLE submissions ADD COLUMN day_of_week TEXT`);
	} catch (e) {
		// Column already exists, ignore
	}

	try {
		await db.execAsync(`ALTER TABLE order_totals ADD COLUMN day_of_week TEXT`);
	} catch (e) {
		// Column already exists, ignore
	}

	try {
		await db.execAsync(`ALTER TABLE extra_orders ADD COLUMN day_of_week TEXT`);
	} catch (e) {
		// Column already exists, ignore
	}

	try {
		await db.execAsync(`ALTER TABLE remark_plus_data ADD COLUMN day_of_week TEXT`);
	} catch (e) {
		// Column already exists, ignore
	}
}


