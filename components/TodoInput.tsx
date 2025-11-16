import { useState, memo } from 'react';
import { View, TextInput, Button, StyleSheet } from 'react-native';

type Props = {
	onSubmit: (title: string) => void;
};

function TodoInputBase({ onSubmit }: Props) {
	const [text, setText] = useState('');

	function handleAdd() {
		if (!text.trim()) return;
		onSubmit(text);
		setText('');
	}

	return (
		<View style={styles.row}>
			<TextInput
				value={text}
				onChangeText={setText}
				placeholder="Add a todo"
				style={styles.input}
				returnKeyType="done"
				onSubmitEditing={handleAdd}
			/>
			<Button title="Add" onPress={handleAdd} />
		</View>
	);
}

export const TodoInput = memo(TodoInputBase);

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		gap: 8,
		padding: 12,
	},
	input: {
		flex: 1,
		borderWidth: 1,
		borderColor: '#ccc',
		borderRadius: 8,
		paddingHorizontal: 12,
		height: 40,
	},
});


