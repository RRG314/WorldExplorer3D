import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const read = async name => (await readFile(new URL(`../app/js/multiplayer/${name}.js`, import.meta.url), 'utf8'))
  .replace(/import[\s\S]*?from\s+["'][^"']+["'];\n/g, '').replaceAll('export function ', 'function ');
const sessionSource = (await read('ui-room-session')).replace(/import\('[^']+'\)/g, 'Promise.resolve(editableModule)');
const runtimeSource = await read('ui-room-runtime');
const noop = () => {};
const pending = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function harness() {
  const callbacks = [], events = [];
  const state = { authUser: { uid: 'one' }, roomSessionGeneration: 0 };
  const renderers = new Proxy({}, { get: () => noop });
  const helpers = new Proxy({ readPoseSnapshot: () => ({}), buildInviteLink: () => null }, { get: (target, key) => target[key] || (v => v) });
  const appCtx = { ensureEditableWorldRuntime: async () => {} };
  const context = vm.createContext({ console, Promise, URL, state, appCtx, refs: {}, renderers, helpers,
    editableModule: { resolveEditableRoomRole: () => 'member', editableRoomPermissions: () => ({}), roomWorldModificationIdentity: room => room.id,
      listenRoomWorldModifications: () => noop },
    startPresence: id => events.push(['presence', id]), recordRecentPlayers: async () => {},
    stopPresence: async () => {}, leaveRoom: async () => {},
    deriveRoomDeterministicSeed: () => 1,
    ...Object.fromEntries(['Room','Players','Chat','Artifacts','RoomActivities','RoomActivityState','SharedBlocks','HomeBase','PaintClaims'].map(kind => [
      'listen'+kind, (id, callback) => { callbacks.push({ kind, id, callback }); return noop; }
    ]))
  });
  vm.runInContext(runtimeSource, context);
  const runtime = context.createUiRoomRuntime({ appCtx, refs: {}, state, renderers, helpers });
  // World loading is independently tested; isolate asynchronous session ownership.
  const sessionRuntime = { ...runtime, syncRoomWorldContext: async () => {}, applyRoomPaintMultiplayerConfig: noop, installPaintClaimPublisher: noop };
  vm.runInContext(sessionSource, context);
  const session = context.createUiRoomSession({ appCtx, refs: {}, state, renderers, helpers, runtime: sessionRuntime });
  return { context, state, appCtx, callbacks, events, runtime, ...session };
}

test('a delayed activation cannot replace a newer room or install duplicate subscriptions', async () => {
  const h = harness(), old = pending(); let calls = 0;
  h.appCtx.ensureEditableWorldRuntime = () => ++calls === 1 ? old.promise : Promise.resolve();
  const first = h.activateRoom({ id: 'AAAAAA', code: 'AAAAAA' });
  assert.equal(await h.activateRoom({ id: 'BBBBBB', code: 'BBBBBB' }), true);
  old.resolve(); assert.equal(await first, false);
  assert.equal(h.state.currentRoom.id, 'BBBBBB');
  assert.ok(h.callbacks.every(row => row.id === 'BBBBBB'));
  assert.deepEqual(h.events, [['presence', 'BBBBBB']]);
});

test('queued old room callbacks cannot overwrite chat or player state after a switch', async () => {
  const h = harness();
  await h.activateRoom({ id: 'AAAAAA', code: 'AAAAAA' });
  const old = h.callbacks.find(row => row.kind === 'Chat');
  await h.activateRoom({ id: 'BBBBBB', code: 'BBBBBB' });
  const current = h.callbacks.find(row => row.kind === 'Chat' && row.id === 'BBBBBB');
  current.callback(['new']); old.callback(['old']);
  assert.deepEqual(h.state.messages, ['new']);
});

test('logout cancels an activation while its modules are still loading', async () => {
  const h = harness(), loading = pending();
  h.appCtx.ensureEditableWorldRuntime = () => loading.promise;
  const joining = h.activateRoom({ id: 'AAAAAA', code: 'AAAAAA' });
  h.state.authUser = null; h.runtime.clearSubscriptions(); loading.resolve();
  assert.equal(await joining, false); assert.equal(h.callbacks.length, 0);
});

test('leave detaches the captured room before awaiting presence; old cleanup cannot clear a newly joined room', async () => {
  const h = harness(), stopped = pending(), events = [];
  h.context.stopPresence = () => { events.push('stop'); return stopped.promise; };
  h.context.leaveRoom = async () => { events.push('leave-old'); };
  h.state.currentRoom = { id: 'AAAAAA' };
  const leaving = h.runtime.deactivateRoom(false);
  assert.deepEqual(events, ['stop', 'leave-old']);
  assert.equal(h.state.currentRoom, null);
  h.state.currentRoom = { id: 'BBBBBB' }; stopped.resolve(); await leaving;
  assert.equal(h.state.currentRoom.id, 'BBBBBB');
});

const roomsText = await readFile(new URL('../app/js/multiplayer/rooms.js', import.meta.url), 'utf8');
function roomApiHarness() {
  const imports = [...roomsText.matchAll(/import\s*\{([^}]+)\}\s*from/g)].flatMap(match => match[1].split(',').map(name => name.trim()).filter(Boolean));
  const code = roomsText.replace(/import[\s\S]*?from\s+["'][^"']+["'];\n/g, '').replace(/export\s*\{[\s\S]*?\};\s*$/, '');
  const admissions = [];
  let user = { uid: 'one', displayName: 'One' };
  const context = vm.createContext({ ...Object.fromEntries(imports.map(name => [name, noop])),
    console: { warn: noop }, DOMException, URLSearchParams, CustomEvent: class {}, dispatchEvent: noop,
    initFirebase: () => ({ db: {} }), getCurrentUser: () => user, normalizeCode: value => value,
    cloneObject: value => structuredClone(value), ROOM_CODE_LENGTH: 6, ROOM_COLLECTION: 'rooms',
    USERS_COLLECTION: 'users', MY_ROOMS_COLLECTION: 'myRooms', PLAYER_COLLECTION: 'players',
    createMultiplayerRoomsDirectoryApi: () => ({}), resolveDisplayName: u => u.displayName,
    doc: (...args) => args, deleteDoc: async () => {}, setDoc: async () => {}, serverTimestamp: () => 'time',
    getDoc: async ref => ({ exists: () => true, id: ref.at(-1) }),
    toRoomObject: snap => ({ id: snap.id, code: snap.id, visibility: 'public', world: {} }),
    postProtectedFunction: () => { const p = pending(); admissions.push(p); return p.promise; }
  });
  vm.runInContext(code, context);
  return { context, admissions, setUser: value => { user = value; } };
}

test('a delayed server admission cannot resurrect a room after leave', async () => {
  const h = roomApiHarness();
  const joining = h.context.joinRoomByCode('AAAAAA');
  await new Promise(resolve => setImmediate(resolve)); await h.context.leaveRoom();
  h.admissions[0].resolve();
  await assert.rejects(joining, { name: 'AbortError' });
  assert.equal(h.context.getCurrentRoom(), null);
});

test('a delayed admission cannot move a different signed-in account into the old room', async () => {
  const h = roomApiHarness(); const joining = h.context.joinRoomByCode('AAAAAA');
  await new Promise(resolve => setImmediate(resolve)); h.setUser({ uid: 'two' }); h.admissions[0].resolve();
  await assert.rejects(joining, { name: 'AbortError' });
  assert.equal(h.context.getCurrentRoom(), null);
});

test('the newest room request owns publication even if an older server admission finishes last', async () => {
  const h = roomApiHarness(); const old = h.context.joinRoomByCode('AAAAAA');
  await new Promise(resolve => setImmediate(resolve)); const next = h.context.joinRoomByCode('BBBBBB');
  await new Promise(resolve => setImmediate(resolve)); h.admissions[1].resolve(); await next;
  h.admissions[0].resolve(); await assert.rejects(old, { name: 'AbortError' });
  assert.equal(h.context.getCurrentRoom().id, 'BBBBBB');
});
