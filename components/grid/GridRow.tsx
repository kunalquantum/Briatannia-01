import { memo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { EditableCell } from './EditableCell';

type Column = { key: string; title: string; width: number; align?: 'left' | 'center' | 'right'; editable?: boolean; keyboard?: 'default' | 'numeric'; color?: string; colorKey?: string; fontWeight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'; backgroundColor?: string; backgroundColorKey?: string; fontWeightKey?: string; onPressKey?: string };

type Props = {
	columns: Column[];
	row: Record<string, any>;
	onChange: (key: string, value: string) => void;
	onEnterPress?: (columnIndex: number) => void;
	onRowPress?: () => void;
	isSelected?: boolean;
	rowIndex?: number;
};

function GridRowBase({ columns, row, onChange, onEnterPress, onRowPress, isSelected, rowIndex }: Props) {
	const handleEnterPress = (columnIndex: number) => {
		if (onEnterPress) {
			onEnterPress(columnIndex);
		}
	};

	const handleRowPress = () => {
		if (onRowPress) {
			onRowPress();
		}
	};

	return (
		<View style={[styles.row, isSelected ? styles.selectedRow : null]}>
			{columns.map((c, columnIndex) => {
				// Determine color: use colorKey if provided, otherwise use direct color
				let cellColor = c.colorKey ? row[c.colorKey] : c.color;
				let cellBackgroundColor = c.backgroundColorKey ? row[c.backgroundColorKey] : c.backgroundColor;
				let cellFontWeight = c.fontWeightKey ? row[c.fontWeightKey] : c.fontWeight;
				
				// Special handling for previousQua column - only show red for non-zero values
				if (c.key === 'previousQua') {
					const value = row[c.key];
					if (!value || value === 0 || value === '0' || value === '') {
						// Hide color and background for zero/empty values
						cellColor = undefined;
						cellBackgroundColor = undefined;
						cellFontWeight = undefined;
					}
				}
				
				return (
					<EditableCell
						key={c.key}
						value={row[c.key] ?? ''}
						width={c.width}
						editable={c.editable !== false}
						keyboard={c.keyboard} 
						align={c.align}
						color={cellColor}
						fontWeight={cellFontWeight}
						backgroundColor={cellBackgroundColor}
						onPress={c.onPressKey ? (() => onChange(c.onPressKey!, '')) : handleRowPress}
						onChange={(text) => onChange(c.key, text)}
						onEnterPress={() => handleEnterPress(columnIndex)}
						onFocus={() => handleRowPress()}
					/>
				);
			})}
		</View>
	);
}
//  adde the value for the make to make the component 
export const GridRow = memo(GridRowBase);

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		height: 40,
		borderBottomWidth: 1,
		borderColor: '#eee',
	},
	selectedRow: {
		backgroundColor: '#fff9c4',
		borderColor: '#ffc107',
		borderWidth: 2,
		borderBottomWidth: 2,
	},
});


