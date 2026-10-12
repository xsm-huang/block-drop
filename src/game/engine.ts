export const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;
export type Kind = (typeof TYPES)[number];
export type Board = (Kind | null)[][];
export type Phase = 'ready' | 'running' | 'paused' | 'gameOver';
export interface Piece { type: Kind; rotation: number; x: number; y: number; id: number }
export interface Game {
  sessionId: string; revision: number; phase: Phase; board: Board; active: Piece | null;
  score: number; bestAtStart: number; random: number; bag: Kind[]; sequence: number;
  gravity: number; lock: number | null; resets: number;
}
export type Action = 'left' | 'right' | 'rotate' | 'soft' | 'hard';
export type Command = { type: Action; sessionId: string; pieceId: number }
  | { type: 'tick'; ms: number } | { type: 'pause' } | { type: 'resume' };
export type GameEvent = { type: 'rotate' | 'lock' | 'clear' | 'over'; rows?: number[] };
export const GRAVITY = 1000;
export const LOCK_DELAY = 500;
export const MAX_RESETS = 8;
const SHAPES: Record<Kind, string[]> = {
  I: ['....', '####', '....', '....'], O: ['##', '##'],
  T: ['.#.', '###', '...'], S: ['.##', '##.', '...'], Z: ['##.', '.##', '...'],
  J: ['#..', '###', '...'], L: ['..#', '###', '...'],
};
const ROTATIONS = Object.fromEntries(TYPES.map(type => {
  const rotations: [number, number][][] = [];
  let points = SHAPES[type].flatMap((row, y) => [...row].flatMap((v, x) => v === '#' ? [[x, y] as [number, number]] : []));
  for (let r = 0; r < 4; r++) {
    rotations.push(points);
    points = points.map(([x, y]) => [SHAPES[type].length - 1 - y, x]);
  }
  return [type, rotations];
})) as Record<Kind, [number, number][][]>;

export const emptyBoard = (): Board => Array.from({ length: 22 }, () => Array<Kind | null>(10).fill(null));
export function cells(piece: Piece): [number, number][] {
  return ROTATIONS[piece.type][piece.rotation].map(([x, y]) => [x + piece.x, y + piece.y]);
}
export function valid(board: Board, piece: Piece): boolean {
  return cells(piece).every(([x, y]) => x >= 0 && x < 10 && y >= 0 && y < 22 && board[y][x] === null);
}
export function dropDistance(board: Board, piece: Piece): number {
  let d = 0;
  while (valid(board, { ...piece, y: piece.y + d + 1 })) d++;
  return d;
}
const grounded = (g: Game) => !!g.active && !valid(g.board, { ...g.active, y: g.active.y + 1 });

function nextRandom(g: Game): number {
  let x = g.random;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  g.random = x >>> 0;
  return g.random;
}
function boundedRandom(g: Game, bound: number): number {
  // xorshift32 produces 1..2^32-1. Shift to a zero-based uniform domain.
  const limit = Math.floor(0xffffffff / bound) * bound;
  let n: number;
  do { n = nextRandom(g) - 1; } while (n >= limit);
  return n % bound;
}
function spawn(g: Game) {
  if (!g.bag.length) {
    g.bag = [...TYPES];
    for (let i = g.bag.length - 1; i > 0; i--) {
      const j = boundedRandom(g, i + 1);
      [g.bag[i], g.bag[j]] = [g.bag[j], g.bag[i]];
    }
  }
  const type = g.bag.shift()!;
  g.active = { type, x: Math.floor((10 - SHAPES[type].length) / 2), y: 1, rotation: 0, id: ++g.sequence };
  g.gravity = GRAVITY; g.lock = null; g.resets = 0;
  if (!valid(g.board, g.active)) { g.phase = 'gameOver'; g.active = null; }
  else startContact(g);
}
export function newGame(seed: number, sessionId: string, bestAtStart = 0): Game {
  const game: Game = { sessionId, revision: 0, phase: 'ready', board: emptyBoard(), active: null,
    score: 0, bestAtStart, random: (seed >>> 0) || 1, bag: [], sequence: 0, gravity: GRAVITY, lock: null, resets: 0 };
  spawn(game);
  return game;
}
function startContact(g: Game) { if (grounded(g) && g.lock === null) g.lock = LOCK_DELAY; }
function lockPiece(g: Game, events: GameEvent[]) {
  if (!g.active) return;
  g.board = g.board.map(row => [...row]);
  for (const [x, y] of cells(g.active)) g.board[y][x] = g.active.type;
  g.score += 10;
  events.push({ type: 'lock' });
  const rows = g.board.flatMap((row, i) => row.every(Boolean) ? [i] : []);
  if (rows.length) {
    g.board = [...Array.from({ length: rows.length }, () => Array<Kind | null>(10).fill(null)),
      ...g.board.filter((_, i) => !rows.includes(i))];
    g.score += [0, 100, 300, 500, 800][rows.length];
    events.push({ type: 'clear', rows });
  }
  if (g.board.slice(0, 2).some(row => row.some(Boolean))) { g.phase = 'gameOver'; g.active = null; }
  else spawn(g);
  if (g.phase === 'gameOver') events.push({ type: 'over' });
}
function advance(g: Game, ms: number, events: GameEvent[]) {
  let remaining = ms;
  while (remaining > 0 && g.phase === 'running') {
    startContact(g);
    const contact = grounded(g);
    const step = Math.min(remaining, g.gravity, contact ? g.lock! : Infinity);
    g.gravity -= step;
    if (contact) g.lock! -= step;
    remaining -= step;
    if (contact && g.lock! <= 0) { lockPiece(g, events); continue; }
    if (g.gravity <= 0) {
      if (!contact) g.active = { ...g.active!, y: g.active!.y + 1 };
      g.gravity = GRAVITY;
      startContact(g);
    }
  }
}
export function transition(state: Game, command: Command): { state: Game; events: GameEvent[] } {
  const events: GameEvent[] = [];
  if (command.type === 'pause') {
    return { state: state.phase === 'running' ? { ...state, phase: 'paused', revision: state.revision + 1 } : state, events };
  }
  if (command.type === 'resume') {
    return { state: state.phase === 'paused' || state.phase === 'ready' ? { ...state, phase: 'running', revision: state.revision + 1 } : state, events };
  }
  if (state.phase !== 'running' || !state.active) return { state, events };
  const g: Game = { ...state, bag: [...state.bag] };
  if (command.type === 'tick') {
    if (!Number.isFinite(command.ms) || command.ms <= 0) return { state, events };
    advance(g, Math.min(command.ms, 60000), events);
  } else {
    if (command.sessionId !== state.sessionId || command.pieceId !== state.active.id) return { state, events };
    const p = state.active;
    if (command.type === 'hard') {
      const d = dropDistance(g.board, p);
      g.active = { ...p, y: p.y + d }; g.score += d * 2;
      lockPiece(g, events);
    } else if (command.type === 'rotate') {
      if (p.type === 'O') return { state, events };
      const offsets = p.type === 'I' ? [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[0,-2]]
        : [[0,0],[-1,0],[1,0],[0,-1],[-1,-1],[1,-1],[0,-2]];
      const rotated = offsets.map(([dx, dy]) => ({ ...p, rotation: (p.rotation + 1) % 4, x: p.x + dx, y: p.y + dy }))
        .find(piece => valid(g.board, piece));
      if (!rotated) return { state, events };
      g.active = rotated; events.push({ type: 'rotate' });
    } else {
      const moved = { ...p, x: p.x + (command.type === 'left' ? -1 : command.type === 'right' ? 1 : 0),
        y: p.y + (command.type === 'soft' ? 1 : 0) };
      if (!valid(g.board, moved)) return { state, events };
      g.active = moved;
      if (command.type === 'soft') { g.score++; g.gravity = GRAVITY; }
    }
    if (command.type !== 'hard') {
      if (command.type !== 'soft' && (grounded(state) || grounded(g)) && g.resets < MAX_RESETS) {
        g.lock = LOCK_DELAY; g.resets++;
      }
      startContact(g);
      if (grounded(g) && g.lock === 0) lockPiece(g, events);
    }
  }
  g.revision++;
  return { state: g, events };
}
