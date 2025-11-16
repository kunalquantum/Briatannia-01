import { memo } from 'react';
import { FlatList, View } from 'react-native';
import type { Todo } from '../repositories/todos';
import { TodoItem } from './TodoItem';

type Props = {
	items: Todo[];
	onToggle: (id: number, done: boolean) => void;
	onDelete: (id: number) => void;
};

function TodoListBase({ items, onToggle, onDelete }: Props) {
	return (
		<FlatList
			data={items}
			keyExtractor={(item) => String(item.id)}
			ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#eee' }} />}
			renderItem={({ item }) => (
				<TodoItem item={item} onToggle={onToggle} onDelete={onDelete} />
			)}
		/>
	);
}

export const TodoList = memo(TodoListBase);


