import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { cells, dropDistance, type Board as BoardData, type Game } from '../game/engine';
import { BoardInput } from '../game/board-input';
import { blockColors, palette } from '../theme';

const StaticCells = memo(function StaticCells({ board, size }: { board: BoardData; size: number }) {
  return <>{board.slice(2).flatMap((row, y) => row.map((type, x) => <View key={`${x}:${y}`} style={{
    position: 'absolute', left: x * size + 1, top: y * size + 1, width: size - 2, height: size - 2,
    borderRadius: Math.min(3, size * 0.12), backgroundColor: type ? blockColors[type] : 'transparent',
    borderWidth: type ? 0 : StyleSheet.hairlineWidth, borderColor: palette.grid,
  }} />))}</>;
});
export function Board({ game, size }: { game: Game; size: number }) {
  const [flash] = useState(() => new Animated.Value(0));
  const previous = useRef(game.board);
  useEffect(() => {
    if (previous.current !== game.board && previous.current.flat().filter(Boolean).length > game.board.flat().filter(Boolean).length) {
      flash.setValue(0.2);
      Animated.timing(flash, { toValue: 0, duration: 120, useNativeDriver: true }).start();
    }
    previous.current = game.board;
  }, [game.board, flash]);
  const adapter = useMemo(() => new BoardInput(size), [size]);
  useEffect(() => { adapter.gesture.cancel(); return () => adapter.gesture.cancel(); }, [adapter, game.active?.id, game.sessionId, game.phase]);
  const piece = game.active;
  const ghost = piece ? { ...piece, y: piece.y + dropDistance(game.board, piece) } : null;
  const renderPiece = (p: NonNullable<typeof piece>, outline: boolean) => cells(p).filter(([, y]) => y >= 2).map(([x, y]) => <View key={`${outline}:${x}:${y}`} style={{
    position: 'absolute', left: x * size + 1, top: (y - 2) * size + 1, width: size - 2, height: size - 2,
    borderRadius: Math.min(3, size * 0.12), backgroundColor: outline ? 'transparent' : blockColors[p.type],
    borderColor: blockColors[p.type], borderWidth: outline ? 1.5 : 0, opacity: outline ? 0.65 : 1,
  }} />);
  return <View {...adapter.responder.panHandlers} accessibilityLabel="俄罗斯方块棋盘，点击旋转，左右滑动移动，下滑下落，快速下滑落底"
    style={{ width: size * 10, height: size * 20, backgroundColor: palette.board, overflow: 'hidden', borderRadius: 5 }}>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <StaticCells board={game.board} size={size} />
      {ghost && piece && ghost.y !== piece.y && renderPiece(ghost, true)}
      {piece && renderPiece(piece, false)}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.text, opacity: flash }]} />
    </View>
  </View>;
}
