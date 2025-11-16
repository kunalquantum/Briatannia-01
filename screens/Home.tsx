import { useEffect } from 'react';
import { SafeAreaView, StyleSheet, View, Text } from 'react-native';
import { TodoInput } from '../components/TodoInput';
import { TodoList } from '../components/TodoList';
import { useTodos } from '../hooks/useTodos';

export default function Home() {
	const { items, add, toggle, remove, loading } = useTodos();

	useEffect(() => {
		// Could add analytics or initial focus here later
	}, []);

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>My Todos</Text>
			</View>
			<TodoInput onSubmit={add} />
			<View style={styles.list}>
				{loading ? (
					<Text style={styles.loading}>Loading...</Text>
				) : (
					<TodoList items={items} onToggle={toggle} onDelete={remove} />
				)}
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#fff',
	},
	header: {
		paddingTop: 12,
		paddingHorizontal: 16,
		paddingBottom: 8,
		borderBottomWidth: 1,
		borderBottomColor: '#eee',
	},
	title: {
		fontSize: 24,
		fontWeight: '600',
	},
	list: {
		flex: 1,
	},
	loading: {
		textAlign: 'center',
		padding: 16,
	},
});


