import { SQLiteProvider } from 'expo-sqlite';
import { PropsWithChildren } from 'react';
import { initializeDatabase } from './migrations';

export function DatabaseProvider({ children }: PropsWithChildren) {
	return (
		<SQLiteProvider databaseName="app.db" onInit={initializeDatabase}>
			{children}
		</SQLiteProvider>
	);
}


