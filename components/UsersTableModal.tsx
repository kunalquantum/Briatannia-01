import { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getAllUsers, deleteAllUsers, User } from '../repositories/users';

type Props = {
	visible: boolean;
	onClose: () => void;
};

export function UsersTableModal({ visible, onClose }: Props) {
	const db = useSQLiteContext();
	const [users, setUsers] = useState<User[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (visible) {
			loadUsers();
		}
	}, [visible]);

	async function loadUsers() {
		setLoading(true);
		try {
			const allUsers = await getAllUsers(db);
			setUsers(allUsers);
		} catch (error) {
			console.error('Error loading users:', error);
		} finally {
			setLoading(false);
		}
	}

	async function handleDeleteAll() {
		Alert.alert(
			'Delete All Users',
			'Are you sure you want to delete ALL users? This action cannot be undone.',
			[
				{
					text: 'Cancel',
					style: 'cancel',
				},
				{
					text: 'Delete All',
					style: 'destructive',
					onPress: async () => {
						setLoading(true);
						try {
							await deleteAllUsers(db);
							await loadUsers();
							Alert.alert('Success', 'All users have been deleted.');
						} catch (error) {
							console.error('Error deleting users:', error);
							Alert.alert('Error', 'Failed to delete users.');
						} finally {
							setLoading(false);
						}
					},
				},
			]
		);
	}

	return (
		<Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
			<View style={styles.modalOverlay}>
				<View style={styles.modalContent}>
					<View style={styles.header}>
						<Text style={styles.title}>All Users</Text>
						<View style={styles.headerButtons}>
							<TouchableOpacity onPress={handleDeleteAll} style={styles.deleteButton}>
								<Text style={styles.deleteButtonText}>Delete All</Text>
							</TouchableOpacity>
							<TouchableOpacity onPress={onClose} style={styles.closeButton}>
								<Text style={styles.closeButtonText}>✕</Text>
							</TouchableOpacity>
						</View>
					</View>

					{loading ? (
						<View style={styles.loadingContainer}>
							<ActivityIndicator size="large" color="#3b82f6" />
						</View>
					) : (
						<View style={styles.scrollContainer}>
							<ScrollView 
								horizontal 
								showsHorizontalScrollIndicator={true}
								contentContainerStyle={styles.horizontalScrollContent}
							>
								<ScrollView 
									showsVerticalScrollIndicator={true}
									nestedScrollEnabled={true}
									style={styles.verticalScroll}
								>
									<View style={styles.tableContainer}>
										{/* Table Header */}
										<View style={styles.tableRow}>
											<Text style={[styles.tableCell, styles.headerCell, styles.idCell]}>ID</Text>
											<Text style={[styles.tableCell, styles.headerCell, styles.usernameCell]}>Username</Text>
											<Text style={[styles.tableCell, styles.headerCell, styles.passwordCell]}>Password</Text>
											<Text style={[styles.tableCell, styles.headerCell, styles.roleCell]}>Role</Text>
											<Text style={[styles.tableCell, styles.headerCell, styles.locationCell]}>Location</Text>
										</View>

										{/* Table Rows */}
										{users.length === 0 ? (
											<View style={styles.tableRow}>
												<Text style={[styles.tableCell, styles.emptyCell]}>No users found</Text>
											</View>
										) : (
											users.map((user, index) => (
												<View key={user.id} style={styles.tableRow}>
													<Text style={[styles.tableCell, styles.idCell]}>{index + 1}</Text>
													<Text style={[styles.tableCell, styles.usernameCell]}>{user.username}</Text>
													<Text style={[styles.tableCell, styles.passwordCell]}>
														{user.password || '-'}
													</Text>
													<Text style={[styles.tableCell, styles.roleCell]}>{user.role}</Text>
													<Text style={[styles.tableCell, styles.locationCell]}>{user.location || '-'}</Text>
												</View>
											))
										)}
									</View>
								</ScrollView>
							</ScrollView>
						</View>
					)}
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	modalContent: {
		backgroundColor: 'white',
		borderRadius: 16,
		width: '90%',
		maxHeight: '90%',
		height: '85%',
		shadowColor: '#000',
		shadowOpacity: 0.25,
		shadowRadius: 10,
		shadowOffset: { width: 0, height: 5 },
		elevation: 10,
	},
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		padding: 20,
		borderBottomWidth: 1,
		borderBottomColor: '#e5e7eb',
	},
	title: {
		fontSize: 20,
		fontFamily: 'PlusJakartaSans_600SemiBold',
		color: '#0f172a',
	},
	headerButtons: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	deleteButton: {
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
		backgroundColor: '#ef4444',
		marginRight: 12,
	},
	deleteButtonText: {
		color: 'white',
		fontSize: 14,
		fontFamily: 'PlusJakartaSans_600SemiBold',
	},
	closeButton: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: '#f1f5f9',
		justifyContent: 'center',
		alignItems: 'center',
	},
	closeButtonText: {
		fontSize: 18,
		color: '#64748b',
		fontWeight: 'bold',
	},
	loadingContainer: {
		padding: 40,
		alignItems: 'center',
		justifyContent: 'center',
	},
	scrollContainer: {
		flex: 1,
	},
	horizontalScrollContent: {
		minWidth: 600,
	},
	verticalScroll: {
		flex: 1,
	},
	tableContainer: {
		padding: 16,
	},
	tableRow: {
		flexDirection: 'row',
		borderBottomWidth: 1,
		borderBottomColor: '#e5e7eb',
		minHeight: 40,
	},
	tableCell: {
		padding: 12,
		fontSize: 14,
		fontFamily: 'PlusJakartaSans_400Regular',
		color: '#334155',
		borderRightWidth: 1,
		borderRightColor: '#e5e7eb',
	},
	headerCell: {
		backgroundColor: '#f8fafc',
		fontFamily: 'PlusJakartaSans_600SemiBold',
		color: '#0f172a',
		fontWeight: '600',
	},
	idCell: {
		width: 60,
		textAlign: 'center',
	},
	usernameCell: {
		width: 120,
	},
	passwordCell: {
		width: 150,
	},
	roleCell: {
		width: 100,
	},
	locationCell: {
		width: 120,
		borderRightWidth: 0,
	},
	emptyCell: {
		flex: 1,
		textAlign: 'center',
		padding: 20,
		color: '#94a3b8',
		borderRightWidth: 0,
	},
});

