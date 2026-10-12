import { useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { gameStore } from '../game/store';
import { Button, Dialog, styles } from '../components/ui';
import { blockColors, palette } from '../theme';

export default function HomeScreen() {
  const app = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasGame = !!app.game && app.game.phase !== 'gameOver';
  const start = async () => {
    if (busy) return;
    setBusy(true);
    try { if (await gameStore.startNew()) router.push('/game'); } finally { setBusy(false); }
  };
  return <SafeAreaView style={styles.screen}>
    <View style={local.top}><Button title="设置" secondary onPress={() => setSettings(true)} /></View>
    <View style={local.hero}>
      <View style={local.mark}>{[0,1,2,4].map(n => <View key={n} style={[local.tile, { left: n % 3 * 25, top: Math.floor(n / 3) * 25 }]} />)}</View>
      <Text style={local.title}>俄罗斯方块<Text style={{ color: palette.accent }}></Text></Text>
      <View style={local.record}><Text style={styles.label}>历史最高分</Text><Text style={local.number}>{app.profile.best.toLocaleString()}</Text></View>
    </View>
    <View style={local.actions}>
      {app.loading ? <ActivityIndicator color={palette.accent} /> : app.fatal
        ? <Button title="重新读取数据" onPress={() => { void gameStore.init(); }} />
        : <>
          {hasGame && <Button title="继续游戏" disabled={busy} onPress={() => router.push('/game')} />}
          <Button title={busy ? '正在准备…' : hasGame ? '新游戏' : '开始游戏'} secondary={hasGame} disabled={busy}
            onPress={() => { void start(); }} />
        </>}
      {app.error && <><Text style={styles.error}>{app.error}</Text>{!app.fatal && <Button secondary title="重试保存" onPress={() => { void gameStore.save(); }} />}</>}
      {app.notice && <Text onPress={() => gameStore.dismissNotice()} style={styles.body}>{app.notice}</Text>}
    </View>
    <Dialog visible={settings} title="设置" onBack={() => setSettings(false)}>
      {(['sound', 'haptics'] as const).map(key => <View key={key} style={local.setting}>
        <Text style={styles.body}>{key === 'sound' ? '音效' : '轻微震动'}</Text>
        <Switch accessibilityLabel={key === 'sound' ? '音效' : '震动'} value={app.profile[key]} trackColor={{ true: palette.accent }}
          onValueChange={value => { void gameStore.setPreference(key, value); }} />
      </View>)}
      {app.error && <><Text style={styles.error}>{app.error}</Text><Button title="重试保存" onPress={() => { void gameStore.save(); }} /></>}
      <Button title="完成" onPress={() => setSettings(false)} />
    </Dialog>
  </SafeAreaView>;
}
const local = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 8 },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  mark: { width: 73, height: 48, marginBottom: 8 },
  tile: { position: 'absolute', width: 23, height: 23, borderRadius: 3, backgroundColor: blockColors.T },
  title: { color: palette.text, fontSize: 54, lineHeight: 58, fontWeight: '800', letterSpacing: 4, textAlign: 'center' },
  record: { alignItems: 'center', gap: 8, marginTop: 20 },
  number: { color: palette.text, fontSize: 32, fontVariant: ['tabular-nums'], fontWeight: '600' },
  actions: { gap: 12, maxWidth: 380, width: '100%', alignSelf: 'center', paddingBottom: 16 },
  footer: { color: palette.muted, fontSize: 12, textAlign: 'center', paddingTop: 8 },
  setting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
});
