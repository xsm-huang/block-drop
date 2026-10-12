import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import type { GameEvent } from '../game/engine';
import type { Profile } from './snapshot';

const sources = {
  rotate: require('../../assets/audio/rotate.wav'),
  lock: require('../../assets/audio/lock.wav'),
  clear: require('../../assets/audio/clear.wav'),
  over: require('../../assets/audio/over.wav'),
};
export class Feedback {
  private players: Partial<Record<GameEvent['type'], AudioPlayer>> = {};
  private token = 0;
  init() {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, allowsRecording: false }).catch(() => {});
    for (const type of Object.keys(sources) as GameEvent['type'][]) {
      try { this.players[type] = createAudioPlayer(sources[type]); } catch { /* Feedback is optional. */ }
    }
  }
  play(events: GameEvent[], profile: Profile) {
    const event = events.find(e => e.type === 'over') ?? events.find(e => e.type === 'clear') ?? events[0];
    if (!event) return;
    const token = ++this.token;
    const player = this.players[event.type];
    if (profile.sound && player) {
      void player.seekTo(0).then(() => { if (token === this.token) player.play(); }).catch(() => {});
    }
    if (profile.haptics && event.type !== 'rotate') {
      void Haptics.impactAsync(event.type === 'clear' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }
  stop() { this.token++; for (const player of Object.values(this.players)) { try { player.pause(); } catch {} } }
  dispose() { this.stop(); for (const player of Object.values(this.players)) player.release(); this.players = {}; }
}
