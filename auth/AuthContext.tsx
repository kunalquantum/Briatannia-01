import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import type { User, UserRole } from '../repositories/users';
import { authenticate, createUser } from '../repositories/users';

type AuthContextValue = {
	user: User | null;
	login: (username: string, password: string) => Promise<boolean>;
	logout: () => void;
	signup: (p: { username: string; password: string; role: UserRole; location?: string }) => Promise<{ ok: boolean; error?: string }>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
	const db = useSQLiteContext();
	const [user, setUser] = useState<User | null>(null);
    const [ready, setReady] = useState<boolean>(false);

	const login = useCallback(async (username: string, password: string) => {
		const found = await authenticate(db, username, password);
		if (found) {
			setUser(found);
			return true;
		}
		return false;
	}, [db]);

	const logout = useCallback(() => {
		setUser(null);
	}, []);

	const signup = useCallback(
		async (params: { username: string; password: string; role: UserRole; location?: string }) => {
			try {
				await createUser(db, params);
				return { ok: true };
			} catch (e: any) {
				const message = String(e?.message ?? 'Signup failed');
				return { ok: false, error: message };
			}
		},
		[db]
	);

	const value = useMemo<AuthContextValue>(() => ({ user, login, logout, signup }), [user, login, logout, signup]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error('useAuth must be used within AuthProvider');
	return ctx;
}


