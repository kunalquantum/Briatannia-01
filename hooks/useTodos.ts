import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import {
	Todo,
	getTodos,
	createTodo,
	setTodoDone,
	deleteTodo,
} from '../repositories/todos';

export function useTodos() {
	const db = useSQLiteContext();
	const [items, setItems] = useState<Todo[]>([]);
	const [loading, setLoading] = useState<boolean>(false);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const rows = await getTodos(db);
			setItems(rows);
		} finally {
			setLoading(false);
		}
	}, [db]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const add = useCallback(
		async (title: string) => {
			if (!title.trim()) return;
			await createTodo(db, title.trim());
			await refresh();
		},
		[db, refresh]
	);

	const toggle = useCallback(
		async (id: number, current: boolean) => {
			await setTodoDone(db, id, !current);
			await refresh();
		},
		[db, refresh]
	);

	const remove = useCallback(
		async (id: number) => {
			await deleteTodo(db, id);
			await refresh();
		},
		[db, refresh]
	);

	return { items, loading, refresh, add, toggle, remove };
}


