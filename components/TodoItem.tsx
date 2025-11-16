import { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { Todo } from '../repositories/todos';

type Props = {
	item: Todo;
	onToggle: (id: number, done: boolean) => void;
	onDelete: (id: number) => void;
};

function TodoItemBase({ item, onToggle, onDelete }: Props) {
	return (
		<View style={styles.row}>
			<Pressable onPress={() => onToggle(item.id, !!item.done)} style={styles.checkbox}>
				{item.done ? <Text>✓</Text> : null}
			</Pressable>
			<Text style={[styles.title, item.done && styles.done]}>{item.title}</Text>
			<Pressable onPress={() => onDelete(item.id)} style={styles.delete}>
				<Text style={{ color: 'white' }}>Delete</Text>
			</Pressable>
		</View>
	);
}

export const TodoItem = memo(TodoItemBase);

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		paddingVertical: 8,
		gap: 8,
	},
	checkbox: {
		width: 24,
		height: 24,
		borderRadius: 4,
		borderWidth: 1,
		borderColor: '#aaa',
		alignItems: 'center',
		justifyContent: 'center',
	},
	title: {
		flex: 1,
		fontSize: 16,
	},
	done: {
		textDecorationLine: 'line-through',
		color: '#888',
	},
	delete: {
		backgroundColor: '#e11d48',
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 6,
	},
});


