import { Image, StyleSheet, View } from 'react-native';

export function BrandSplash() {
	return (
		<View style={styles.root}>
			<Image
				source={require('../assets/Gemini_Generated_Image_ywbgysywbgysywbg.png')}
				style={styles.image}
				resizeMode="contain"
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
	image: { width: '70%', height: '70%' },
});


