require('./load-ts.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const Module = require('node:module');
const { newGame, transition } = require('../src/game/engine.ts');
const { defaultProfile } = require('../src/services/snapshot.ts');
const { SaveQueue } = require('../src/services/save-queue.ts');

// Execute production SQL against SQLite in memory; emulate only the Expo transport.
let lastDatabase;
let failGameWrite = false;
function sqliteAdapter() {
  const native = new DatabaseSync(':memory:');
  const db = {
    native,
    execAsync: async sql => native.exec(sql),
    getFirstAsync: async (sql, ...params) => native.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, ...params) => native.prepare(sql).all(...params),
    runAsync: async (sql, ...params) => {
      if (failGameWrite && sql.startsWith('INSERT') && params[0] === 'game') throw new Error('disk full');
      return native.prepare(sql).run(...params);
    },
    withExclusiveTransactionAsync: async callback => {
      native.exec('BEGIN EXCLUSIVE');
      try { await callback(db); native.exec('COMMIT'); }
      catch (error) { native.exec('ROLLBACK'); throw error; }
    },
  };
  return db;
}
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'expo-sqlite') return { openDatabaseAsync: async () => (lastDatabase = sqliteAdapter()) };
  if (request === '../services/feedback') return { Feedback: class { init() {} play() {} stop() {} dispose() {} } };
  return originalLoad.call(this, request, ...rest);
};
const { Storage } = require('../src/services/storage.ts');
const { GameStore } = require('../src/game/store.ts');
Module._load = originalLoad;

test('SQLite stores and restores a complete game and independent settings', async () => {
  const storage = new Storage(); await storage.load();
  let g = transition(newGame(55, 'complete', 80), { type: 'resume' }).state;
  g = transition(g, { type: 'soft', sessionId: g.sessionId, pieceId: g.active.id }).state;
  await storage.save(g, { ...defaultProfile, best: 80, sound: false });
  const loaded = await storage.load();
  assert.deepEqual(loaded.game, { ...g, phase: 'paused' });
  assert.equal(loaded.profile.sound, false); assert.equal(loaded.profile.best, 80);
  lastDatabase.native.close();
});
test('SQLite transaction rolls back both profile and game on a partial write failure', async () => {
  const storage = new Storage(); await storage.load();
  const first = newGame(1, 'first');
  await storage.save(first, { ...defaultProfile, best: 20 });
  failGameWrite = true;
  try { await assert.rejects(storage.save({ ...first, score: 100 }, { ...defaultProfile, best: 100 })); }
  finally { failGameWrite = false; }
  const loaded = await storage.load();
  assert.equal(loaded.game.score, 0); assert.equal(loaded.profile.best, 20);
  lastDatabase.native.close();
});
test('ending game deletes resumable data and highest score never decreases', async () => {
  const storage = new Storage(); await storage.load();
  const g = newGame(1, 'end'); await storage.save(g, { ...defaultProfile, best: 100 });
  await storage.save({ ...g, phase: 'gameOver', active: null, score: 200 }, defaultProfile);
  await storage.save(null, { ...defaultProfile, best: 0, sound: false });
  const loaded = await storage.load();
  assert.equal(loaded.game, null); assert.equal(loaded.profile.best, 200); assert.equal(loaded.profile.sound, false);
  lastDatabase.native.close();
});
test('corrupt game is removed without losing valid profile', async () => {
  const storage = new Storage(); await storage.load();
  await storage.save(null, { ...defaultProfile, best: 500 });
  await lastDatabase.runAsync('INSERT INTO records (key,value) VALUES (?,?)', 'game', '{bad');
  const loaded = await storage.load();
  assert.equal(loaded.corrupt, true); assert.equal(loaded.game, null); assert.equal(loaded.profile.best, 500);
  assert.equal((await storage.load()).corrupt, false);
  lastDatabase.native.close();
});

function fakeStore(game = null) {
  let fail = false;
  const writes = [];
  const storage = { queue: new SaveQueue(), load: async () => ({ game, profile: { ...defaultProfile, best: 90 }, corrupt: false }),
    save: async (g, p) => { if (fail) throw new Error('write failure'); writes.push({ game: g, profile: p }); } };
  const feedback = { init() {}, play() {}, stop() {}, dispose() {} };
  return { store: new GameStore(storage, feedback), writes, setFailure(value) { fail = value; } };
}
test('controller requires explicit resume after background and ignores hidden-page input', async () => {
  const { store } = fakeStore(); await store.init(); await store.startNew(); store.setVisible(true); store.resume();
  store.setForeground(false);
  assert.equal(store.getSnapshot().game.phase, 'paused');
  store.setForeground(true);
  assert.equal(store.getSnapshot().game.phase, 'paused');
  store.resume(); store.setVisible(false);
  const g = store.getSnapshot().game;
  assert.equal(store.input('hard', g.sessionId, g.active.id), false);
  assert.equal(store.getSnapshot().game.phase, 'paused'); store.dispose();
});
test('save failure pauses the controller, retains memory, and retry clears the error', async () => {
  const f = fakeStore(); await f.store.init(); await f.store.startNew(); f.store.setVisible(true); f.store.resume();
  const sessionId = f.store.getSnapshot().game.sessionId;
  f.setFailure(true); assert.equal(await f.store.save(), false);
  assert.equal(f.store.getSnapshot().game.phase, 'paused'); assert.ok(f.store.getSnapshot().error);
  assert.equal(f.store.getSnapshot().game.sessionId, sessionId);
  f.setFailure(false); assert.equal(await f.store.save(), true); assert.equal(f.store.getSnapshot().error, null);
  f.store.dispose();
});
test('new sessions retain their own record baseline and old piece commands cannot score', async () => {
  const { store } = fakeStore(); await store.init(); await store.startNew(); store.setVisible(true); store.resume();
  const first = store.getSnapshot().game;
  assert.equal(first.bestAtStart, 90);
  assert.equal(store.input('hard', first.sessionId, first.active.id), true);
  assert.equal(store.input('hard', first.sessionId, first.active.id), false);
  const oldSession = first.sessionId;
  await store.startNew(); store.resume();
  assert.equal(store.input('hard', oldSession, 1), false); assert.equal(store.getSnapshot().game.score, 0);
  store.dispose();
});
test('async initialization discarded after disposal cannot resurrect old state', async () => {
  let resolve;
  const storage = { queue: new SaveQueue(), load: () => new Promise(r => { resolve = r; }), save: async () => {} };
  const store = new GameStore(storage, { init() {}, play() {}, stop() {}, dispose() {} });
  const loading = store.init(); store.dispose();
  resolve({ game: newGame(1, 'stale'), profile: defaultProfile, corrupt: false }); await loading;
  assert.equal(store.getSnapshot().game, null);
});
