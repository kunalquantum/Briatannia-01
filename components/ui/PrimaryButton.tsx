import { memo } from 'react';
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
	title: string;
	onPress: () => void;
	disabled?: boolean;
	style?: ViewStyle;
};

function PrimaryButtonBase({ title, onPress, disabled, style }: Props) {
	return (
		<Pressable disabled={disabled} onPress={onPress} style={[styles.pressable, disabled && { opacity: 0.6 }, style]}>
			<LinearGradient colors={["#0ea5e9", "#0369a1"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
				<Text style={styles.label}>{title}</Text>
			</LinearGradient>
		</Pressable>
	);
}

export const PrimaryButton = memo(PrimaryButtonBase);

const styles = StyleSheet.create({
	pressable: {
		borderRadius: 12,
		shadowColor: '#000',
		shadowOpacity: 0.15,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 4 },
		elevation: 4,
	},
	gradient: {
		borderRadius: 12,
		paddingVertical: 12,
		alignItems: 'center',
	},
	label: {
		color: 'white',
		fontWeight: '600',
		fontSize: 16,
		letterSpacing: 0.5,
		fontFamily: 'PlusJakartaSans_600SemiBold',
	},
});


