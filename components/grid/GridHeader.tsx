import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
	columns: { key: string; title: string; width: number; align?: 'left' | 'center' | 'right'; color?: string; fontWeight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'; backgroundColor?: string }[];
};

function GridHeaderBase({ columns }: Props) {
	return (
		<View style={styles.row}>
			{columns.map((c) => (
				<View key={c.key} style={[styles.cell, { width: c.width }, c.backgroundColor ? { backgroundColor: c.backgroundColor } : null]}>
					<Text style={[styles.title, { textAlign: c.align ?? 'left' }, c.color ? { color: c.color } : null, c.fontWeight ? { fontWeight: c.fontWeight } : null]} numberOfLines={2}>
						{c.title}
					</Text>
				</View>
			))}
		</View>
	);
}

export const GridHeader = memo(GridHeaderBase);

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		borderBottomWidth: 1,
		borderColor: '#ddd',
		backgroundColor: '#f9fafb',
		height: 60,
	},
	cell: {
		borderRightWidth: 1,
		borderColor: '#ddd',
		justifyContent: 'center',
		paddingHorizontal: 8,
	},
	title: {
		fontWeight: '600',
	},
});


