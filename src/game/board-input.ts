import { PanResponder, type GestureResponderEvent } from 'react-native';
import { Gesture } from './input';
import { gameStore } from './store';

const sample = (e: GestureResponderEvent) => ({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, time: e.nativeEvent.timestamp });

/** Owns a touch sequence independently of React rendering. */
export class BoardInput {
  private binding: { sessionId: string; pieceId: number } | null = null;
  readonly gesture: Gesture;
  readonly responder: ReturnType<typeof PanResponder.create>;
  constructor(size: number) {
    this.gesture = new Gesture(size, action => {
      if (!this.binding || gameStore.getSnapshot().game?.phase !== 'running') return false;
      return gameStore.input(action, this.binding.sessionId, this.binding.pieceId);
    });
    this.responder = PanResponder.create({
      onStartShouldSetPanResponder: () => gameStore.getSnapshot().game?.phase === 'running',
      onPanResponderGrant: e => {
        const g = gameStore.getSnapshot().game;
        if (e.nativeEvent.touches.length !== 1 || !g?.active) { this.gesture.cancel(); return; }
        this.binding = { sessionId: g.sessionId, pieceId: g.active.id };
        this.gesture.start(sample(e));
      },
      onPanResponderStart: e => { if (e.nativeEvent.touches.length !== 1) this.gesture.cancel(); },
      onPanResponderMove: e => { if (e.nativeEvent.touches.length !== 1) this.gesture.cancel(); else this.gesture.move(sample(e)); },
      onPanResponderRelease: e => this.gesture.end(sample(e)),
      onPanResponderTerminate: () => this.gesture.cancel(),
      onPanResponderTerminationRequest: () => true,
    });
  }
}
