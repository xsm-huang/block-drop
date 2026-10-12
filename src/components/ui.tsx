import type { PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme';

export function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    android_disableSound style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled) && { opacity: 0.6 }]}>
    <Text style={[styles.buttonText, secondary && { color: palette.text }]}>{title}</Text>
  </Pressable>;
}
export function Dialog({ visible, title, children, onBack = () => {} }: PropsWithChildren<{ visible: boolean; title: string; onBack?: () => void }>) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onBack}>
    <View style={styles.shade}><View style={styles.dialog} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={{ gap: 16 }} bounces={false}>
        <Text accessibilityRole="header" style={styles.heading}>{title}</Text>{children}
      </ScrollView>
    </View></View>
  </Modal>;
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background, paddingHorizontal: 20 },
  button: { minHeight: 52, borderRadius: 14, backgroundColor: palette.accent, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  secondary: { backgroundColor: palette.surface },
  buttonText: { color: palette.background, fontSize: 16, fontWeight: '600' },
  heading: { color: palette.text, fontSize: 26, fontWeight: '700' },
  body: { color: palette.muted, fontSize: 16, lineHeight: 25 },
  label: { color: palette.muted, fontSize: 12, letterSpacing: 2 },
  shade: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 400, maxHeight: '85%', alignSelf: 'center', borderRadius: 24, padding: 24, backgroundColor: palette.surface },
  error: { color: palette.error, fontSize: 14, textAlign: 'center' },
});
