import { useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ScreenBackground } from '../components/ui/ScreenBackground';
import { LabeledInput } from '../components/ui/LabeledInput';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { UsersTableModal } from '../components/UsersTableModal';

export default function Login() {
	const { login } = useAuth();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [busy, setBusy] = useState(false);
	const [showUsersModal, setShowUsersModal] = useState(false);

	async function handleLogin() {
		if (!username.trim()) return Alert.alert('Validation', 'Username is required');
		setBusy(true);
		const ok = await login(username.trim(), password);
		setBusy(false);
		if (!ok) return Alert.alert('Login failed', 'Invalid username or password');
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
							<Text style={styles.title}>Welcome back</Text>
							<View style={styles.form}>
								<LabeledInput label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="Enter username" />
								<LabeledInput label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Enter password" />
								<PrimaryButton title={busy ? 'Signing in...' : 'Login'} onPress={handleLogin} />
								<TouchableOpacity onPress={() => setShowUsersModal(true)} style={styles.viewUsersButton}>
									<Text style={styles.viewUsersButtonText}>View All Users</Text>
								</TouchableOpacity>
							</View>
						</View>
					</ScrollView>
				</SafeAreaView>
			</KeyboardAvoidingView>
			<UsersTableModal visible={showUsersModal} onClose={() => setShowUsersModal(false)} />
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
	viewUsersButton: {
		marginTop: 8,
		paddingVertical: 12,
		paddingHorizontal: 16,
		backgroundColor: '#f1f5f9',
		borderRadius: 8,
		alignItems: 'center',
	},
	viewUsersButtonText: {
		color: '#3b82f6',
		fontSize: 14,
		fontFamily: 'PlusJakartaSans_600SemiBold',
	},
});


