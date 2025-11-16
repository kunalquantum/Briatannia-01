import { memo } from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';

type Props = TextInputProps & {
	label: string;
};

function LabeledInputBase({ label, style, ...rest }: Props) {
	return (
		<View style={styles.container}>
			<Text style={styles.label} allowFontScaling={false}>{label}</Text>
			<TextInput {...rest} style={[styles.input, style]} placeholderTextColor="#9ca3af" allowFontScaling={false} />
		</View>
	);
}

export const LabeledInput = memo(LabeledInputBase);

const styles = StyleSheet.create({
	container: { gap: 6 },
	label: { color: '#0f172a', fontSize: 14, fontFamily: 'PlusJakartaSans_600SemiBold' },
	input: {
		borderWidth: 1,
		borderColor: '#e5e7eb',
		backgroundColor: '#fff',
		borderRadius: 12,
		paddingHorizontal: 14,
		height: 44,
		fontSize: 14,
		lineHeight: 18,
		color: '#0f172a',
		shadowColor: '#000',
		shadowOpacity: 0.06,
		shadowRadius: 6,
		shadowOffset: { width: 0, height: 2 },
		elevation: 2,
		fontFamily: 'PlusJakartaSans_400Regular',
	},
});


