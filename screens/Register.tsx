import { useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, Alert, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ScreenBackground } from '../components/ui/ScreenBackground';
import { LabeledInput } from '../components/ui/LabeledInput';
import { PrimaryButton } from '../components/ui/PrimaryButton';

type RoleOption = 'worker' | 'supervisor' | 'admin';

type Props = {
	onRegistered?: () => void;
	onToggleToLogin?: () => void;
};

export default function Register({ onRegistered, onToggleToLogin }: Props) {
	const { signup } = useAuth();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [role, setRole] = useState<RoleOption>('worker');
	const [location, setLocation] = useState('');
	const [busy, setBusy] = useState(false);

	async function handleRegister() {
		if (!username.trim()) return Alert.alert('Validation', 'Username is required');
		if (password !== confirm) return Alert.alert('Validation', 'Passwords do not match');
		setBusy(true);
		const res = await signup({ username: username.trim(), password, role, location: role === 'worker' ? location : undefined });
		setBusy(false);
		if (!res.ok) return Alert.alert('Signup failed', res.error ?? '');
		// Auto-redirect to Login
		onRegistered?.();
	}

	return (
		<ScreenBackground>
			<KeyboardAvoidingView 
				style={{ flex: 1 }} 
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}
				keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
			>
				<SafeAreaView style={styles.container}>
					<ScrollView 
						contentContainerStyle={styles.scrollContent}
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}
					>
						<View style={styles.card}>
							<Text style={styles.title}>Create account</Text>
							<View style={styles.form}>
								<LabeledInput label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="Enter username" />
								<LabeledInput label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Enter password" />
								<LabeledInput label="Confirm Password" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Re-enter password" />

								<View style={styles.roleRow}>
									{(['worker', 'supervisor', 'admin'] as RoleOption[]).map((r) => (
										<View key={r} style={[styles.rolePill, role === r && styles.rolePillActive]}>
											<Text onPress={() => setRole(r)} style={[styles.roleText, role === r && styles.roleTextActive]}>{r}</Text>
										</View>
									))}
								</View>

								{role === 'worker' ? (
									<LabeledInput label="Location (optional)" value={location} onChangeText={setLocation} placeholder="e.g. Sector 12" />
								) : null}

								<PrimaryButton title={busy ? 'Creating...' : 'Create Account'} onPress={handleRegister} />
							</View>
							{onToggleToLogin && (
								<TouchableOpacity onPress={onToggleToLogin} style={styles.toggleButton}>
									<Text style={styles.toggleText}>Have an account? Login</Text>
								</TouchableOpacity>
							)}
						</View>
					</ScrollView>
				</SafeAreaView>
			</KeyboardAvoidingView>
		</ScreenBackground>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	scrollContent: { 
		flexGrow: 1, 
		padding: 20,
		paddingBottom: 100,
	},
	card: {
		backgroundColor: 'white',
		borderRadius: 16,
		padding: 20,
		marginTop: 40,
		shadowColor: '#000',
		shadowOpacity: 0.08,
		shadowRadius: 12,
		shadowOffset: { width: 0, height: 6 },
		elevation: 4,
	},
	title: { fontSize: 24, fontFamily: 'PlusJakartaSans_600SemiBold', marginBottom: 12, color: '#0f172a' },
	form: { gap: 14 },
	roleRow: { flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 6 },
	rolePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f1f5f9' },
	rolePillActive: { backgroundColor: '#e0f2fe' },
	roleText: { color: '#334155', fontFamily: 'PlusJakartaSans_400Regular' },
	roleTextActive: { color: '#0369a1', fontFamily: 'PlusJakartaSans_600SemiBold' },
	toggleButton: {
		marginTop: 16,
		paddingVertical: 8,
		alignItems: 'center',
	},
	toggleText: {
		color: '#3b82f6',
		fontSize: 14,
		fontFamily: 'PlusJakartaSans_400Regular',
	},
});


