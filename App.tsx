import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Button } from 'react-native';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BrandSplash } from './components/BrandSplash';
import { DatabaseProvider } from './db';
import Home from './screens/Home';
import Worker from './screens/Worker';
import Admin from './screens/Admin';
import Supervisor from './screens/Supervisor';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Login from './screens/Login';
import Register from './screens/Register';

function Root() {
	const { user } = useAuth();
	const [showRegister, setShowRegister] = useState(true);
	if (!user) {
		return (
			<View style={{ flex: 1 }}>
				<View style={{ flex: 1 }}>
					{showRegister ? <Register onRegistered={() => setShowRegister(false)} /> : <Login />}
				</View>
				<View style={styles.toggleButtonContainer}>
					<Button
						title={showRegister ? 'Have an account? Login' : "Don't have an account? Register"}
						onPress={() => setShowRegister((v) => !v)}
					/>
				</View>
			</View>
		);
	}
	// After login: show Worker screen for role 'worker', otherwise blank for now
	if (user.role === 'worker') {
		return <Worker />;
	}
	if (user.role === 'admin') {
		return <Admin />;
	}
	if (user.role === 'supervisor') {
		return <Supervisor />;
	}
	return <View style={{ flex: 1 }} />;
}

export default function App() {
  const [fontsLoaded] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold });
  const [showBrand, setShowBrand] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowBrand(false), 1200);
    return () => clearTimeout(t);
  }, []);
  if (!fontsLoaded) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ flex: 1, backgroundColor: '#fff' }} />
      </GestureHandlerRootView>
    );
  }
  if (showBrand) {
    return (
      <GestureHandlerRootView style={styles.container}>
        <BrandSplash />
      </GestureHandlerRootView>
    );
  }
  return (
    <GestureHandlerRootView style={styles.container}>
      <DatabaseProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </DatabaseProvider>
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  toggleButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: 'transparent',
  },
});
