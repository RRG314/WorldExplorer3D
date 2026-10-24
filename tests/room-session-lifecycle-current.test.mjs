import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const read = async name => (await readFile(new URL(`../app/js/multiplayer/${name}.js`, import.meta.url), 'utf8'))
  .replace(/import[\s\S]*?from\s+["'][^"']+["'];\n/g, '').replaceAll('export function ', 'function ');
const sessionSource = (await read('ui-room-session')).replace(/import\('[^']+'\)/g, 'Promise.resolve(editableModule)');
const runtimeSource = await read('ui-room-runtime');
const {leavesRoomForEarthLocation,roomPoseReady}=await import('../app/js/multiplayer/room-world-policy.js');
const noop = () => {};
const pending = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function harness({sync=async()=>true}={}) {
  const callbacks = [], events = [], timers = new Map();
  let nextTimer = 0;
  const state = { authUser: { uid: 'one' }, roomSessionGeneration: 0 };
  const renderers = new Proxy({}, { get: () => noop });
  const helpers = new Proxy({ readPoseSnapshot: () => ({}), buildInviteLink: () => null }, { get: (target, key) => target[key] || (v => v) });
  const appCtx = { ensureEditableWorldRuntime: async () => {} };
  const context = vm.createContext({ console, Promise, URL, leavesRoomForEarthLocation,roomPoseReady, window: {setInterval: callback => {const id=++nextTimer;timers.set(id,callback);return id;},clearInterval:id=>timers.delete(id)}, state, appCtx, refs: {}, renderers, helpers,
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
  const sessionRuntime = { ...runtime, syncRoomWorldContext: sync, applyRoomPaintMultiplayerConfig: noop, installPaintClaimPublisher: noop };
  vm.runInContext(sessionSource, context);
  const session = context.createUiRoomSession({ appCtx, refs: {}, state, renderers, helpers, runtime: sessionRuntime });
  return { context, state, appCtx, callbacks, events, timers, runtime, ...session };
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

test('room building reset awaits its own commit and never clears the separate block collection', async () => {
  const h = harness(), completion = pending(); let configuration, called = 0;
  h.appCtx.configureSharedEditableWorld = value => { configuration = value; };
  h.context.editableModule.resetRoomWorldModifications = room => { assert.equal(room.id, 'AAAAAA'); called++; return completion.promise; };
  h.context.clearRoomSharedBlocks = () => { throw Error('Blocks are a separate explicit action'); };
  await h.activateRoom({ id: 'AAAAAA', code: 'AAAAAA' });
  let settled = false; const reset = configuration.reset().then(value => { settled = true; return value; });
  await Promise.resolve(); assert.equal(called, 1); assert.equal(settled, false);
  completion.resolve(3); assert.equal(await reset, 3);
  h.context.editableModule.resetRoomWorldModifications = async () => { throw Error('rejected reset'); };
  await h.activateRoom({ id: 'BBBBBB', code: 'BBBBBB' });
  await assert.rejects(configuration.reset(), /rejected reset/);
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

test('remote-player updates exist only during an active room and restart once on rejoin', async () => {
 const h=harness();h.runtime.ensureGhostTicker();assert.equal(h.timers.size,0);
 await h.activateRoom({id:'AAAAAA',code:'AAAAAA'});assert.equal(h.timers.size,1);
 h.runtime.ensureGhostTicker();assert.equal(h.timers.size,1);
 await h.runtime.deactivateRoom();assert.equal(h.timers.size,0);
 await h.activateRoom({id:'BBBBBB',code:'BBBBBB'});assert.equal(h.timers.size,1);
 h.runtime.clearSubscriptions();assert.equal(h.timers.size,0);
});

test('travel detaches the captured room locally before slow network cleanup and preserves a newer join',async()=>{
 const h=harness(),network=pending();h.context.stopPresence=()=>network.promise;
 await h.activateRoom({id:'AAAAAA',code:'AAAAAA',world:{kind:'earth',lat:1,lon:2}});
 assert.equal(h.runtime.prepareRoomWorldChange({lat:1,lon:2}),false);assert.equal(h.state.currentRoom.id,'AAAAAA');
 const old=h.callbacks.find(row=>row.kind==='Chat');assert.equal(h.runtime.prepareRoomWorldChange({lat:3,lon:4}),true);assert.equal(h.state.currentRoom,null);assert.equal(h.timers.size,0);
 h.state.currentRoom={id:'BBBBBB'};h.state.messages=['new'];old.callback(['obsolete']);assert.deepEqual(h.state.messages,['new']);network.resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.state.currentRoom.id,'BBBBBB');
});

test('world preparation settles before room listeners attach; failed preparation cannot announce a connection',async()=>{
 const preparing=pending(),h=harness({sync:()=>preparing.promise});const joining=h.activateRoom({id:'AAAAAA',code:'AAAAAA'});await new Promise(resolve=>setImmediate(resolve));assert.equal(h.callbacks.length,0);preparing.resolve(true);assert.equal(await joining,true);assert.ok(h.callbacks.length>0);
 const failed=harness({sync:async()=>false});assert.equal(await failed.activateRoom({id:'BBBBBB',code:'BBBBBB'}),false);assert.equal(failed.callbacks.length,0);assert.equal(failed.state.currentRoom,null);assert.equal(failed.timers.size,0);
});
test('room seed ownership transfers across room switches and restores the captured solo override on leave',async()=>{
 const h=harness();let loads=0;h.context.document={getElementById:()=>null};h.context.isEarthWorldUsable=()=>true;h.context.deriveRoomDeterministicSeed=room=>room.code==='AAAAAA'?42:84;
 Object.assign(h.appCtx,{gameStarted:true,sharedSeedOverride:123,loadRoads:async()=>{loads++;return{state:'published'}}});
 const first={id:'AAAAAA',code:'AAAAAA',world:{kind:'earth',lat:1,lon:2,seed:'same'}},second={...first,id:'BBBBBB',code:'BBBBBB'};
 h.state.currentRoom=first;await h.runtime.syncRoomWorldContext(first,true);assert.equal(h.appCtx.sharedSeedOverride,42);
 h.state.currentRoom=second;await h.runtime.syncRoomWorldContext(second,false);assert.equal(h.appCtx.sharedSeedOverride,84);assert.equal(loads,2,'same city but different room seed requires its own publication');
 await h.runtime.deactivateRoom(false);assert.equal(h.appCtx.sharedSeedOverride,123);
 h.state.currentRoom=first;await h.runtime.syncRoomWorldContext(first,true);h.appCtx.sharedSeedOverride=99;await h.runtime.deactivateRoom(false);assert.equal(h.appCtx.sharedSeedOverride,99,'a newer seed owner is preserved');
});
