require('./load-ts.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Gesture } = require('../src/game/input.ts');
const { newGame, transition } = require('../src/game/engine.ts');
const { decodeGame, decodeProfile } = require('../src/services/snapshot.ts');
const { SaveQueue } = require('../src/services/save-queue.ts');
const sample = (x,y,time) => ({ x,y,time });
function input() {
  const actions = [], gesture = new Gesture(30, action => { actions.push(action); return true; });
  gesture.start(sample(0,0,0)); return { actions, gesture };
}
test('tap rotates once, long hold and cancellation never rotate', () => {
  let { gesture, actions } = input(); gesture.end(sample(3,2,100)); assert.deepEqual(actions, ['rotate']);
  ({ gesture, actions } = input()); gesture.end(sample(0,0,500)); assert.deepEqual(actions, []);
  ({ gesture, actions } = input()); gesture.cancel(); gesture.end(sample(0,0,100)); assert.deepEqual(actions, []);
});
test('horizontal drag moves by cells, cannot become vertical or tap', () => {
  const { gesture, actions } = input();
  gesture.move(sample(65,2,200)); gesture.move(sample(65,150,300)); gesture.end(sample(65,150,350));
  assert.deepEqual(actions, ['right','right']);
});
test('fast swipe hard-drops once; continued touch never affects next piece', () => {
  const { gesture, actions } = input();
  gesture.move(sample(0,60,30)); gesture.move(sample(0,200,50)); gesture.end(sample(0,200,70));
  assert.deepEqual(actions, ['hard']);
});
test('slow swipe soft-drops by distance, then fast segment uses remaining hard drop', () => {
  const { gesture, actions } = input();
  gesture.move(sample(0,30,200)); gesture.move(sample(0,60,400));
  assert.deepEqual(actions, ['soft','soft']);
  gesture.move(sample(0,65,600)); gesture.move(sample(0,130,630));
  assert.deepEqual(actions, ['soft','soft','hard']);
});
test('upward swipe and multi-touch cancellation have no game actions', () => {
  const { gesture, actions } = input();
  gesture.move(sample(0,-50,20)); gesture.move(sample(0,100,60)); gesture.end(sample(0,100,100));
  assert.deepEqual(actions, []);
});
test('blocked drag does not accumulate a debt before reversing', () => {
  const actions = [];
  const g = new Gesture(30, a => { actions.push(a); return a === 'right'; });
  g.start(sample(0,0,0)); g.move(sample(-300,0,200)); g.move(sample(-270,0,300));
  assert.deepEqual(actions, ['left','right']);
});
test('save roundtrip freezes game and preserves random sequence, scores and timers', () => {
  let g = transition(newGame(42, 'saved'), { type: 'resume' }).state;
  g = transition(g, { type: 'tick', ms: 123 }).state;
  const restored = decodeGame(JSON.stringify({ schema: 1, rules: 1, game: g }));
  assert.deepEqual(restored, { ...g, phase: 'paused' });
  assert.deepEqual(transition(restored, { type: 'resume' }).state.bag, g.bag);
});
test('malformed, incompatible and invalid snapshots cannot resume', () => {
  const g = newGame(1, 'invalid');
  assert.equal(decodeGame('{'), null);
  assert.equal(decodeGame(JSON.stringify({ schema: 2, rules: 1, game: g })), null);
  for (const patch of [{ board: [] }, { random: 0 }, { score: -1 }, { gravity: 5000 }, { bag: ['I','I'] },
    { active: { ...g.active, x: 99 } }, { resets: 9 }, { phase: 'gameOver' }]) {
    assert.equal(decodeGame(JSON.stringify({ schema: 1, rules: 1, game: { ...g, ...patch } })), null);
  }
  const board = g.board.map(row => [...row]); board[0][0] = 'J';
  assert.equal(decodeGame(JSON.stringify({ schema: 1, rules: 1, game: { ...g, board } })), null);
});
test('profile validation preserves valid fields and defaults invalid ones', () => {
  assert.deepEqual(decodeProfile('{"best":123,"sound":false,"haptics":"no"}'), { best:123, sound:false, haptics:true, tutorial:false });
  assert.equal(decodeProfile('bad').best, 0);
});
test('delayed old session write cannot overwrite a new session', async () => {
  const queue = new SaveQueue(); let unblock; const saved = [];
  const blocking = queue.enqueue(() => new Promise(resolve => { unblock = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  const old = queue.enqueue(async () => { saved.push('old'); }, queue.current());
  queue.replace();
  const current = queue.enqueue(async () => { saved.push('new'); }, queue.current());
  unblock(); await Promise.all([blocking, old, current]);
  assert.deepEqual(saved, ['new']);
});
test('failed save rejects but does not poison subsequent retries', async () => {
  const queue = new SaveQueue(); let committed = false;
  await assert.rejects(queue.enqueue(async () => { throw new Error('disk'); }));
  await queue.enqueue(async () => { committed = true; }); assert.equal(committed, true);
});
