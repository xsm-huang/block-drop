require('./load-ts.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TYPES, cells, newGame, valid, dropDistance, transition, emptyBoard } = require('../src/game/engine.ts');
const running = () => transition(newGame(12345, 'test'), { type: 'resume' }).state;
const act = (g, type) => transition(g, { type, sessionId: g.sessionId, pieceId: g.active.id });
const tick = (g, ms) => transition(g, { type: 'tick', ms }).state;
const floor = () => ({ ...running(), active: { type: 'O', x: 4, y: 20, rotation: 0, id: 1 }, lock: 500 });

test('all seven shapes have four unique occupied cells in all orientations', () => {
  for (const type of TYPES) for (let rotation = 0; rotation < 4; rotation++) {
    assert.equal(new Set(cells({ type, rotation, x: 0, y: 0, id: 1 }).map(String)).size, 4);
  }
});
test('left/right/bottom collision checks occupied cells, not matrix whitespace', () => {
  const board = emptyBoard();
  const piece = { type: 'I', rotation: 1, x: -2, y: 5, id: 1 };
  assert.equal(valid(board, piece), true);
  assert.equal(valid(board, { ...piece, x: -3 }), false);
  assert.equal(valid(board, { ...piece, x: 8 }), false);
  assert.equal(valid(board, { ...piece, y: 19 }), false);
  board[6][0] = 'O';
  assert.equal(valid(board, piece), false);
});
test('gravity does not award operation points and natural locking awards 10', () => {
  let g = running();
  const y = g.active.y;
  g = tick(g, 1000);
  assert.equal(g.active.y, y + 1); assert.equal(g.score, 0);
  g = tick(floor(), 500);
  assert.equal(g.score, 10); assert.equal(g.active.id, 2);
});
test('soft drop plus hard drop uses distinct distances and scoring', () => {
  let g = { ...running(), active: { type: 'O', x: 4, y: 12, rotation: 0, id: 1 } };
  for (let i = 0; i < 3; i++) g = act(g, 'soft').state;
  assert.equal(g.score, 3); assert.equal(dropDistance(g.board, g.active), 5);
  for (let x = 0; x < 10; x++) if (x !== 4 && x !== 5) g.board[21][x] = 'J';
  g = act(g, 'hard').state;
  assert.equal(g.score, 123);
});
test('zero-distance hard drop locks once, stale inputs are ignored', () => {
  const g = floor(); const command = { type: 'hard', sessionId: g.sessionId, pieceId: 1 };
  const next = transition(g, command).state;
  assert.equal(next.score, 10);
  assert.equal(transition(next, command).state, next);
  assert.equal(transition(next, { ...command, pieceId: 2, sessionId: 'old' }).state, next);
});
for (const count of [1, 2, 3, 4]) test(`simultaneously clears ${count} rows with correct score`, () => {
  const g = running();
  g.active = { type: 'I', rotation: 1, x: 7, y: 18, id: 1 }; g.lock = 500;
  for (let y = 22 - count; y < 22; y++) for (let x = 0; x < 9; x++) g.board[y][x] = 'J';
  const result = act(g, 'hard');
  assert.equal(result.state.score, 10 + [0,100,300,500,800][count]);
  assert.equal(result.events.find(e => e.type === 'clear').rows.length, count);
  assert.equal(result.state.board.length, 22);
  assert.equal(result.state.board.flat().filter(Boolean).length, 4 - count);
});
test('lock delay freezes across pause, invalid moves never extend it', () => {
  let g = tick(floor(), 499);
  assert.equal(g.lock, 1);
  assert.equal(act(g, 'soft').state, g);
  g = transition(g, { type: 'pause' }).state;
  assert.equal(tick(g, 10000), g);
  g = transition(g, { type: 'resume' }).state;
  assert.equal(tick(g, 1).score, 10);
});
test('O rotation is inert and lock extension is limited to eight resets', () => {
  let g = floor();
  assert.equal(act(g, 'rotate').state, g);
  for (let i = 0; i < 8; i++) { g = tick(g, 100); g = act(g, i % 2 ? 'right' : 'left').state; }
  assert.equal(g.resets, 8); assert.equal(g.lock, 500);
  g = tick(g, 400); g = act(g, 'left').state;
  assert.equal(g.lock, 100); assert.equal(tick(g, 100).score, 10);
});
test('leaving support keeps the remaining lock budget instead of refreshing it', () => {
  let g = { ...running(), active: { type: 'O', x: 4, y: 18, rotation: 0, id: 1 }, lock: 123, resets: 8 };
  g.board[20][4] = 'J'; g.board[20][5] = 'J';
  g = act(g, 'left').state; g = act(g, 'left').state;
  g = tick(g, 100);
  assert.equal(g.lock, 123);
  g = act(g, 'right').state;
  assert.equal(g.lock, 123); assert.equal(tick(g, 123).score, 10);
});
test('rotation near wall uses compensation, blocked rotation leaves state intact', () => {
  let g = { ...running(), active: { type: 'I', rotation: 1, x: -2, y: 5, id: 1 } };
  g = act(g, 'rotate').state;
  assert.equal(g.active.rotation, 2); assert.equal(g.active.x, 0);
  const blocked = { ...running(), active: { type: 'T', rotation: 0, x: 4, y: 8, id: 1 } };
  blocked.board = Array.from({ length: 22 }, () => Array(10).fill('J'));
  for (const [x,y] of cells(blocked.active)) blocked.board[y][x] = null;
  assert.equal(act(blocked, 'rotate').state, blocked);
});
test('top overflow ends game; clearing hidden rows can avoid overflow', () => {
  const g = { ...running(), active: { type: 'O', x: 8, y: 0, rotation: 0, id: 1 } };
  g.board[2][8] = 'J';
  assert.equal(act(g, 'hard').state.phase, 'gameOver');
  for (const y of [0,1]) for (let x = 0; x < 8; x++) g.board[y][x] = 'L';
  const saved = act(g, 'hard').state;
  assert.equal(saved.phase, 'running'); assert.equal(saved.score, 310);
});
test('spawn collision ends game without credit for a failed spawn', () => {
  const g = floor(); g.bag = ['I']; g.board[2][4] = 'Z';
  const next = act(g, 'hard').state;
  assert.equal(next.phase, 'gameOver'); assert.equal(next.active, null); assert.equal(next.score, 10);
});
test('seven-bag is reproducible and each bag contains every kind', () => {
  function sequence() {
    let g = running(); const types = [];
    for (let i = 0; i < 28; i++) {
      types.push(g.active.type); g = { ...g, board: emptyBoard() }; g = act(g, 'hard').state;
    }
    return types;
  }
  const a = sequence(); assert.deepEqual(a, sequence());
  for (let i = 0; i < 28; i += 7) assert.deepEqual([...a.slice(i, i+7)].sort(), [...TYPES].sort());
});
test('engine does not mutate input snapshots, tick segmentation is equivalent', () => {
  const g = floor(), before = JSON.stringify(g);
  const whole = tick(g, 1600), split = tick(tick(g, 500), 1100);
  assert.equal(JSON.stringify(g), before);
  assert.deepEqual({ ...whole, revision: 0 }, { ...split, revision: 0 });
});
