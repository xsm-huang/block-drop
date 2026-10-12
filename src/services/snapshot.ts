import { GRAVITY, LOCK_DELAY, MAX_RESETS, TYPES, valid, type Game } from '../game/engine';

export interface Profile { best: number; sound: boolean; haptics: boolean; tutorial: boolean }
export const defaultProfile: Profile = { best: 0, sound: true, haptics: true, tutorial: false };
export interface Envelope { schema: 1; rules: 1; game: Game }
const integer = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const kind = (v: unknown) => TYPES.includes(v as (typeof TYPES)[number]);
export function decodeProfile(raw: string | null): Profile {
  try {
    const v = JSON.parse(raw ?? '{}');
    return { best: integer(v.best, 0) ? v.best : 0,
      sound: typeof v.sound === 'boolean' ? v.sound : true,
      haptics: typeof v.haptics === 'boolean' ? v.haptics : true,
      tutorial: typeof v.tutorial === 'boolean' ? v.tutorial : false };
  } catch { return { ...defaultProfile }; }
}
export function decodeGame(raw: string): Game | null {
  try {
    const e = JSON.parse(raw);
    if (e.schema !== 1 || e.rules !== 1) return null;
    const g = e.game as Game;
    if (!g || typeof g.sessionId !== 'string' || !g.sessionId.length || !integer(g.revision, 0)
      || !['ready', 'running', 'paused'].includes(g.phase) || !integer(g.score, 0) || !integer(g.bestAtStart, 0)
      || !integer(g.random, 1, 0xffffffff) || !integer(g.sequence, 1)
      || !Array.isArray(g.board) || g.board.length !== 22
      || !g.board.every(row => Array.isArray(row) && row.length === 10 && row.every(c => c === null || kind(c)))
      || g.board.some(row => row.every(Boolean)) || g.board.slice(0, 2).some(row => row.some(Boolean))
      || !Array.isArray(g.bag) || g.bag.length > 6 || !g.bag.every(kind) || new Set(g.bag).size !== g.bag.length
      || !Number.isFinite(g.gravity) || g.gravity <= 0 || g.gravity > GRAVITY
      || !(g.lock === null || (Number.isFinite(g.lock) && g.lock >= 0 && g.lock <= LOCK_DELAY))
      || !integer(g.resets, 0, MAX_RESETS)) return null;
    const p = g.active;
    if (!p || !kind(p.type) || !integer(p.rotation, 0, 3) || (p.type === 'O' && p.rotation !== 0)
      || !integer(p.x, -3, 9) || !integer(p.y, -3, 21) || !integer(p.id, 1) || p.id !== g.sequence
      || !valid(g.board, p)) return null;
    const contact = !valid(g.board, { ...p, y: p.y + 1 });
    if (contact && g.lock === null) return null;
    return { ...g, phase: 'paused' };
  } catch { return null; }
}
