import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { gameStore } from '../game/store';
import { palette } from '../theme';

export default function RootLayout() {
  useEffect(() => {
    gameStore.setForeground(AppState.currentState === 'active');
    void gameStore.init();
    const subscription = AppState.addEventListener('change', state => gameStore.setForeground(state === 'active'));
    return () => { subscription.remove(); gameStore.dispose(); };
  }, []);
  return <SafeAreaProvider>
    <StatusBar style="light" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background }, gestureEnabled: false }}>
      <Stack.Screen name="index" /><Stack.Screen name="game" />
    </Stack>
  </SafeAreaProvider>;
}
