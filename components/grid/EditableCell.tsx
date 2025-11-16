import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View, StyleSheet } from 'react-native';

type Props = {
	value: string | number;
	onChange?: (text: string) => void;
	width?: number;
	editable?: boolean;
	keyboard?: 'default' | 'numeric';
	align?: 'left' | 'center' | 'right';
	color?: string;
	fontWeight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
	backgroundColor?: string;
	onPress?: () => void;
	onEnterPress?: () => void;
	onFocus?: () => void;
};

function EditableCellBase({ value, onChange, width = 100, editable = true, keyboard = 'default', align = 'left', color, fontWeight, backgroundColor, onPress, onEnterPress, onFocus }: Props) {
	const [isEditing, setIsEditing] = useState(false);
	const [text, setText] = useState(String(value ?? ''));
	const inputRef = useRef<TextInput>(null);

	useEffect(() => {
		setText(String(value ?? ''));
	}, [value]);

	// Immediate focus when editing starts
	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
		}
	}, [isEditing]);

	function commit() {
		setIsEditing(false);
		if (onChange) onChange(text);
	}

	function handleSubmitEditing() {
		commit();
		if (onEnterPress) {
			onEnterPress();
		}
	}

	// Direct edit on press for instant response
	function handlePress() {
		if (editable) {
			setIsEditing(true);
			if (onFocus) onFocus();
			// Force immediate focus
			setTimeout(() => {
				inputRef.current?.focus();
			}, 0);
		}
	}

	return (
		<View style={[styles.cell, { width }, backgroundColor ? { backgroundColor } : null] }>
			{editable ? (
				isEditing ? (
					<TextInput
						ref={inputRef}
						value={text}
						onChangeText={setText}
						style={[styles.input, { textAlign: align }, color ? { color } : null, fontWeight ? { fontWeight } : null]}
						keyboardType={keyboard === 'numeric' ? 'numeric' : 'default'}
						onBlur={commit}
						onSubmitEditing={handleSubmitEditing}
						onFocus={onFocus}
						returnKeyType="next"
						autoFocus={true}
						selectTextOnFocus={true}
						blurOnSubmit={false}
						caretHidden={false}
						contextMenuHidden={false}
					/>
				) : (
					<Pressable 
						onPress={handlePress}
						style={styles.pressable}
						hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
						pressRetentionOffset={{ top: 15, bottom: 15, left: 15, right: 15 }}
					>
						<Text style={[styles.text, { textAlign: align }, color ? { color } : null, fontWeight ? { fontWeight } : null]} numberOfLines={1}>
							{String(value ?? '')}
						</Text>
					</Pressable>
				)
			) : (
                onPress ? (
                    <Pressable 
						onPress={onPress}
						style={styles.pressable}
						hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
						pressRetentionOffset={{ top: 15, bottom: 15, left: 15, right: 15 }}
					>
                        <Text style={[styles.text, { textAlign: align }, color ? { color } : null, fontWeight ? { fontWeight } : null, { textDecorationLine: 'underline' }]} numberOfLines={1}>
							{String(value ?? '')}
						</Text>
					</Pressable>
				) : (
					<Text style={[styles.text, { textAlign: align }, color ? { color } : null, fontWeight ? { fontWeight } : null]} numberOfLines={1}>
						{String(value ?? '')}
					</Text>
				)
			)}
		</View>
	);
}

export const EditableCell = memo(EditableCellBase);

const styles = StyleSheet.create({
	cell: {
		borderRightWidth: 1,
		borderColor: '#ddd',
		justifyContent: 'center',
		paddingHorizontal: 8,
		height: 40,
	},
	pressable: {
		flex: 1,
		justifyContent: 'center',
		minHeight: 40,
	},
	text: {
		fontSize: 14,
	},
	input: {
		fontSize: 14,
		padding: 0,
		margin: 0,
		height: 40,
	},
});


