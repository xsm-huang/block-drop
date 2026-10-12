import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { gameStore } from '../game/store';
import { Board } from '../components/Board';
import { Button, Dialog, styles } from '../components/ui';
import { palette } from '../theme';

export default function GameScreen() {
  const app = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useFocusEffect(useCallback(() => {
    gameStore.setVisible(true);
    const back = BackHandler.addEventListener('hardwareBackPress', () => { gameStore.pause(); return true; });
    return () => { gameStore.setVisible(false); back.remove(); };
  }, []));
  const game = app.game;
  const leave = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); gameStore.pause();
    try { if (await gameStore.save()) router.replace('/'); } finally { busyRef.current = false; setBusy(false); }
  };
  const restart = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await gameStore.startNew(); } finally { busyRef.current = false; setBusy(false); }
  };
  if (!game) return <SafeAreaView style={styles.screen}><Text style={styles.body}>请先开始一局游戏。</Text><Button title="返回首页" onPress={() => router.replace('/')} /></SafeAreaView>;
  const size = Math.max(1, Math.floor(Math.min(area.width / 10, area.height / 20)));
  const tutorial = (game.phase === 'ready' || game.phase === 'paused') && !app.profile.tutorial;
  const overlay = game.phase !== 'running';
  return <SafeAreaView style={[styles.screen, { paddingHorizontal: 16 }]}>
    <View style={local.scores}>
      <View style={{ flex: 1 }}><Text style={styles.label}>本局得分</Text><Text numberOfLines={1} adjustsFontSizeToFit style={local.score}>{game.score.toLocaleString()}</Text></View>
      <View style={{ alignItems: 'flex-end', flex: 1 }}><Text style={styles.label}>历史最高</Text><Text numberOfLines={1} adjustsFontSizeToFit style={local.best}>{app.profile.best.toLocaleString()}</Text></View>
    </View>
    <View style={local.boardArea} onLayout={e => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {area.width > 0 && area.height > 0 && <Board game={game} size={size} />}
    </View>
    <View style={local.controls}>
      <Text style={local.hint}>点击旋转 · 左右移动 · 快速下滑落底</Text>
      <Button title="Ⅱ  暂停" secondary onPress={() => gameStore.pause()} disabled={overlay} />
    </View>
    <Dialog visible={overlay} title={tutorial ? '一只手，轻松玩' : game.phase === 'gameOver' ? '本局结束' : game.phase === 'ready' ? '准备好了吗？' : '已暂停'}
      onBack={game.phase === 'gameOver' ? () => { void leave(); } : () => {}}>
      {tutorial ? <>
        <Text style={styles.body}>点击棋盘：顺时针旋转{ '\n' }左右滑动：移动方块{ '\n' }普通下滑：逐格下移{ '\n' }快速下滑：直接落底</Text>
        <Button title="开始游戏" disabled={busy} onPress={() => { void gameStore.finishTutorial(); }} />
      </> : game.phase === 'gameOver' ? <>
        <Text style={styles.body}>本局得分</Text><Text style={local.score}>{game.score.toLocaleString()}</Text>
        <Text style={styles.body}>{game.score > game.bestAtStart ? '新纪录！ ' : ''}历史最高：{app.profile.best.toLocaleString()}</Text>
        <Button title="再来一局" disabled={busy} onPress={() => { void restart(); }} />
      </> : <>
        <Button title={game.phase === 'ready' ? '开始游戏' : '继续游戏'} disabled={busy} onPress={() => gameStore.resume()} />
      </>}
      {app.error && <><Text style={styles.error}>{app.error}</Text><Button title="重试保存" disabled={busy} onPress={() => { void gameStore.save(); }} /></>}
      <Button title={busy ? '正在保存…' : '返回首页'} secondary disabled={busy} onPress={() => { void leave(); }} />
    </Dialog>
    <Dialog visible={!overlay && !!app.error} title="保存未完成" onBack={() => gameStore.pause()}>
      <Text style={styles.error}>{app.error}</Text>
      <Button title="暂停并重试" onPress={() => { gameStore.pause(); void gameStore.save(); }} />
    </Dialog>
  </SafeAreaView>;
}
const local = StyleSheet.create({
  scores: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, gap: 12 },
  score: { color: palette.text, fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
  best: { color: palette.muted, fontSize: 20, fontVariant: ['tabular-nums'] },
  boardArea: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 0 },
  controls: { paddingTop: 10, paddingBottom: 8, gap: 10 },
  hint: { color: palette.muted, fontSize: 12, textAlign: 'center' },
});
