import type { SQLiteDatabase } from 'expo-sqlite';

export type Todo = {
	id: number;
	title: string;
	done: number; // 0 or 1
	created_at: number; // unix seconds
};

export async function getTodos(db: SQLiteDatabase): Promise<Todo[]> {
	return await db.getAllAsync<Todo>(
		'SELECT id, title, done, created_at FROM todos ORDER BY id DESC'
	);
}

export async function createTodo(db: SQLiteDatabase, title: string): Promise<void> {
	await db.runAsync('INSERT INTO todos (title) VALUES (?)', [title]);
}

export async function setTodoDone(
	db: SQLiteDatabase,
	id: number,
	done: boolean
): Promise<void> {
	await db.runAsync('UPDATE todos SET done = ? WHERE id = ?', [done ? 1 : 0, id]);
}

export async function deleteTodo(db: SQLiteDatabase, id: number): Promise<void> {
	await db.runAsync('DELETE FROM todos WHERE id = ?', [id]);
}


