import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../app/js/multiplayer/presence.js', import.meta.url), 'utf8'))
  .replace(/import[\s\S]*?from\s+'[^']+';\n/g, '')
  .replace(/export\s*\{[\s\S]*?\};\s*$/, '');
function harness({ rejected = false, writeImpl = async () => {} } = {}) {
  let now = 100_000;
  const calls = [];
  const context = vm.createContext({
    Date: { now: () => now }, console: { warn() {} },
    initFirebase: () => ({ db: {} }), getCurrentUser: () => ({ uid: 'member', displayName: 'Member' }),
    doc: (...args) => args, serverTimestamp: () => 'server-time', Timestamp: { fromMillis: n => n },
    setDoc: async (...args) => { calls.push(['write', ...args]); await writeImpl(); },
    postProtectedFunction: async (...args) => { calls.push(['admit', ...args]); if (rejected) throw new Error('Room full'); }
  });
  vm.runInContext(source + "\nactiveRoomId='ROOM01';getPose=()=>({});lastWriteAt=Date.now();", context);
  return { calls, switchRoom: () => vm.runInContext("void stopPresence({releaseLease:false});activeRoomId='ROOM02';getPose=()=>({});lastWriteAt=Date.now();", context), advance: ms => { now += ms; }, write: (force = false) => context.writePresence(force) };
}
test('expired presence requests server admission instead of reviving its document', async () => {
  const h = harness(); h.advance(91_000); await h.write();
  assert.deepEqual(h.calls.map(c => c[0]), ['admit']);
  assert.equal(h.calls[0][1], '/joinRoom');
  assert.equal(h.calls[0][2].roomCode, 'ROOM01');
  h.advance(2500); await h.write();
  assert.deepEqual(h.calls.map(c => c[0]), ['admit', 'write']);
});
test('full-room reconnection does not fall back to direct writes and backs off', async () => {
  const h = harness({ rejected: true }); h.advance(91_000); await h.write();
  h.advance(2500); await h.write();
  assert.deepEqual(h.calls.map(c => c[0]), ['admit']);
  h.advance(15_000); await h.write();
  assert.deepEqual(h.calls.map(c => c[0]), ['admit', 'admit']);
});
test('an active presence uses the ordinary bounded heartbeat', async () => {
  const h = harness(); h.advance(2500); await h.write();
  assert.deepEqual(h.calls.map(c => c[0]), ['write']);
});

test('visibility events cannot bypass the server heartbeat spacing', async () => {
  const h = harness();await h.write(true);h.advance(2000);await h.write(true);
  assert.equal(h.calls.length,0);h.advance(251);await h.write(true);
  assert.deepEqual(h.calls.map(c=>c[0]),['write']);
});


test('completion of an old room heartbeat cannot release the new room write lock', async () => {
  const pending=[];const h=harness({writeImpl:()=>new Promise(resolve=>pending.push(resolve))});
  h.advance(2500);const old=h.write();h.switchRoom();h.advance(2500);const current=h.write();
  assert.equal(pending.length,2);pending[0]();await old;
  h.advance(2500);await h.write();assert.equal(pending.length,2);
  pending[1]();await current;
});
