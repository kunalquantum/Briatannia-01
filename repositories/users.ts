import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export type UserRole = 'worker' | 'supervisor' | 'admin';

export type User = {
	id: number;
	username: string;
	password_hash: string;
	password?: string | null;
	role: UserRole;
	location: string | null;
	created_at: number;
};

export async function hashPassword(password: string): Promise<string> {
	return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, password);
}

export async function createUser(
	db: SQLiteDatabase,
	params: { username: string; password: string; role: UserRole; location?: string }
): Promise<void> {
	const { username, password, role, location } = params;
	if (!username.trim()) {
		throw new Error('Username is required');
	}
	if (!['worker', 'supervisor', 'admin'].includes(role)) {
		throw new Error('Invalid role');
	}
	const password_hash = await hashPassword(password);
	await db.runAsync(
		`INSERT INTO users (username, password_hash, password, role, location) VALUES (?, ?, ?, ?, ?)`,
		[username.trim(), password_hash, password, role, role === 'worker' ? (location ?? null) : null]
	);
}

export async function getUserByUsername(db: SQLiteDatabase, username: string): Promise<User | null> {
	const rows = await db.getAllAsync<User>(
		`SELECT id, username, password_hash, password, role, location, created_at FROM users WHERE username = ? LIMIT 1`,
		[username]
	);
	return rows[0] ?? null;
}

export async function authenticate(
	db: SQLiteDatabase,
	username: string,
	password: string
): Promise<User | null> {
	const user = await getUserByUsername(db, username);
	if (!user) return null;
	const hash = await hashPassword(password);
    if (user.password_hash === hash) {
        try { await db.runAsync(`UPDATE users SET last_login = strftime('%s','now') WHERE id = ?`, [user.id]); } catch {}
        return user;
    }
    return null;
}

export async function getWorkers(db: SQLiteDatabase): Promise<Array<{ id: number; label: string }>> {
    const rows = await db.getAllAsync<{ id: number; label: string }>(
        `SELECT id, COALESCE(location, username) as label FROM users WHERE role = 'worker'`
    );
    
    // Define the desired sequence for workers
    const workerSequence = [
        'prabhadevi 1',
        'prabhadevi 2',
        'parel',
        'saat rasta',
        'sea face',
        'worli bdd',
        'worli mix',
        'matunga',
        'mahim',
        'koliwada',
        'Mix'
    ];
    
    // Create a map for quick lookup of sequence index
    const sequenceMap = new Map<string, number>();
    workerSequence.forEach((name, index) => {
        sequenceMap.set(name.toLowerCase(), index);
    });
    
    // Sort workers based on the predefined sequence
    const sorted = rows.sort((a, b) => {
        const aLabel = a.label.toLowerCase();
        const bLabel = b.label.toLowerCase();
        
        const aIndex = sequenceMap.get(aLabel);
        const bIndex = sequenceMap.get(bLabel);
        
        // If both are in the sequence, sort by their index
        if (aIndex !== undefined && bIndex !== undefined) {
            return aIndex - bIndex;
        }
        // If only a is in the sequence, it comes first
        if (aIndex !== undefined) {
            return -1;
        }
        // If only b is in the sequence, it comes first
        if (bIndex !== undefined) {
            return 1;
        }
        // If neither is in the sequence, sort alphabetically
        return aLabel.localeCompare(bLabel);
    });
    
    return sorted;
}

export async function getWorkerDetails(db: SQLiteDatabase): Promise<Array<{ id: number; username: string; location: string | null }>> {
    return await db.getAllAsync<{ id: number; username: string; location: string | null }>(
        `SELECT id, username, location FROM users WHERE role = 'worker' ORDER BY COALESCE(location, username)`
    );
}

export async function updateUserLocation(db: SQLiteDatabase, id: number, location: string | null): Promise<void> {
    await db.runAsync(`UPDATE users SET location = ? WHERE id = ?`, [location ?? null, id]);
}

export async function deleteUser(db: SQLiteDatabase, id: number): Promise<void> {
    await db.runAsync(`DELETE FROM users WHERE id = ?`, [id]);
}

export async function getAllUsers(db: SQLiteDatabase): Promise<User[]> {
    return await db.getAllAsync<User>(
        `SELECT id, username, password_hash, password, role, location, created_at FROM users ORDER BY id`
    );
}

export async function deleteAllUsers(db: SQLiteDatabase): Promise<void> {
    await db.runAsync(`DELETE FROM users`);
}


