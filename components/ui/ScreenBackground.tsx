import { PropsWithChildren } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { View, StyleSheet } from 'react-native';

export function ScreenBackground({ children }: PropsWithChildren) {
	return (
		<View style={styles.root}>
			<LinearGradient colors={["#f0f9ff", "#e0f2fe"]} style={StyleSheet.absoluteFillObject as any} />
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
});


