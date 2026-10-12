import * as SQLite from 'expo-sqlite';
import type { Game } from '../game/engine';
import { decodeGame, decodeProfile, type Profile } from './snapshot';
import { SaveQueue } from './save-queue';

export class Storage {
  private db: SQLite.SQLiteDatabase | null = null;
  readonly queue = new SaveQueue();
  async load() {
    const db = this.db ?? await SQLite.openDatabaseAsync('block-drop.db');
    this.db = db;
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((version?.user_version ?? 0) > 1) throw new Error('此版本无法读取较新的游戏数据');
    await db.execAsync(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      PRAGMA user_version = 1;`);
    const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM records');
    const records = Object.fromEntries(rows.map(row => [row.key, row.value]));
    const profile = decodeProfile(records.profile ?? null);
    const game = records.game ? decodeGame(records.game) : null;
    const corrupt = !!records.game && !game;
    if (corrupt) await db.runAsync('DELETE FROM records WHERE key = ?', 'game');
    return { profile, game, corrupt };
  }
  save(game: Game | null, profile: Profile, generation = this.queue.current()) {
    const payload = game && game.phase !== 'gameOver' ? JSON.stringify({ schema: 1, rules: 1, game }) : null;
    const capturedProfile = { ...profile };
    return this.queue.enqueue(async () => {
      const db = this.db;
      if (!db) throw new Error('存储未就绪');
      await db.withExclusiveTransactionAsync(async tx => {
        const existing = await tx.getFirstAsync<{ value: string }>('SELECT value FROM records WHERE key = ?', 'profile');
        capturedProfile.best = Math.max(capturedProfile.best, decodeProfile(existing?.value ?? null).best, game?.score ?? 0);
        await tx.runAsync('INSERT OR REPLACE INTO records (key, value) VALUES (?, ?)', 'profile', JSON.stringify(capturedProfile));
        if (payload) await tx.runAsync('INSERT OR REPLACE INTO records (key, value) VALUES (?, ?)', 'game', payload);
        else await tx.runAsync('DELETE FROM records WHERE key = ?', 'game');
      });
    }, generation);
  }
}
