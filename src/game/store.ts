import { newGame, transition, type Action, type Command, type Game } from './engine';
import { Storage } from '../services/storage';
import { Feedback } from '../services/feedback';
import { defaultProfile, type Profile } from '../services/snapshot';

export interface AppSnapshot { game: Game | null; profile: Profile; loading: boolean; error: string | null; fatal: boolean; notice: string | null }
export class GameStore {
  private snapshot: AppSnapshot = { game: null, profile: { ...defaultProfile }, loading: true, error: null, fatal: false, notice: null };
  private game: Game | null = null;
  private listeners = new Set<() => void>();
  constructor(
    private storage: Pick<Storage, 'load' | 'save' | 'queue'> = new Storage(),
    private feedback: Pick<Feedback, 'init' | 'play' | 'stop' | 'dispose'> = new Feedback(),
  ) {}
  private initialized = false;
  private initEpoch = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private last = 0;
  private foreground = true;
  private visible = false;
  private saveRequest = 0;
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<AppSnapshot> = {}) {
    this.snapshot = { ...this.snapshot, ...patch, game: this.game };
    this.listeners.forEach(listener => listener());
  }
  async init() {
    if (this.initialized) return;
    this.initialized = true;
    const epoch = ++this.initEpoch;
    try {
      const loaded = await this.storage.load();
      if (epoch !== this.initEpoch) return;
      this.game = loaded.game;
      this.feedback.init();
      this.publish({ profile: loaded.profile, loading: false, fatal: false, error: null,
        notice: loaded.corrupt ? '上次进度无法恢复，可以开始新游戏。' : null });
    } catch {
      if (epoch !== this.initEpoch) return;
      this.initialized = false;
      this.publish({ loading: false, fatal: true, error: '无法打开本地数据，请重试。' });
    }
  }
  private dispatch(command: Command) {
    if (!this.game) return false;
    const before = this.game;
    const result = transition(before, command);
    if (result.state === before) return false;
    this.game = result.state;
    if (this.game.phase !== 'running') this.stopClock();
    const profile = this.game.score > this.snapshot.profile.best
      ? { ...this.snapshot.profile, best: this.game.score } : this.snapshot.profile;
    // Timer-only changes stay internal; rendering needs only visible changes.
    if (before.active !== this.game.active || before.board !== this.game.board || before.phase !== this.game.phase || before.score !== this.game.score) this.publish({ profile });
    if (this.foreground) this.feedback.play(result.events, profile);
    if (result.events.some(e => e.type === 'lock' || e.type === 'over') || command.type === 'pause') void this.save();
    else if (!this.saveTimer) this.saveTimer = setTimeout(() => { this.saveTimer = null; void this.save(); }, 500);
    return true;
  }
  private syncTime() {
    if (this.game?.phase !== 'running') return;
    const now = performance.now();
    const ms = now - this.last; this.last = now;
    if (ms > 250) this.pause(false);
    else this.dispatch({ type: 'tick', ms });
  }
  private stopClock() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  private startClock() {
    this.stopClock(); this.last = performance.now();
    this.timer = setInterval(() => this.syncTime(), 50);
  }
  input(action: Action, sessionId: string, pieceId: number) {
    if (!this.visible || !this.foreground) return false;
    this.syncTime();
    return this.dispatch({ type: action, sessionId, pieceId });
  }
  resume() {
    if (!this.visible || !this.foreground || this.snapshot.fatal) return;
    this.dispatch({ type: 'resume' });
    if (this.game?.phase === 'running') this.startClock();
  }
  pause(sync = true) {
    if (sync) this.syncTime();
    this.stopClock(); this.feedback.stop(); this.dispatch({ type: 'pause' });
  }
  setVisible(value: boolean) { if (!value) this.pause(); this.visible = value; }
  setForeground(value: boolean) { if (!value) this.pause(); this.foreground = value; }
  async startNew() {
    if (this.snapshot.loading || this.snapshot.fatal) return false;
    this.pause();
    this.storage.queue.replace();
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    this.game = newGame(seed, `${Date.now()}-${seed}`, this.snapshot.profile.best);
    this.publish({ notice: null });
    return this.save();
  }
  async setPreference(key: 'sound' | 'haptics', value: boolean) {
    this.feedback.stop(); this.publish({ profile: { ...this.snapshot.profile, [key]: value } });
    await this.save();
  }
  async finishTutorial() {
    this.publish({ profile: { ...this.snapshot.profile, tutorial: true } });
    if (await this.save()) this.resume();
  }
  async save(): Promise<boolean> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.snapshot.fatal || this.snapshot.loading) return false;
    const request = ++this.saveRequest;
    try {
      await this.storage.save(this.game, this.snapshot.profile);
      if (request === this.saveRequest && this.snapshot.error) this.publish({ error: null });
      return true;
    } catch {
      if (request === this.saveRequest) {
        this.stopClock(); this.feedback.stop();
        if (this.game) this.game = transition(this.game, { type: 'pause' }).state;
        this.publish({ error: '进度保存失败，请重试。' });
      }
      return false;
    }
  }
  dismissNotice() { this.publish({ notice: null }); }
  dispose() {
    this.initEpoch++;
    this.pause();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.feedback.dispose(); this.initialized = false;
  }
}
export const gameStore = new GameStore();
