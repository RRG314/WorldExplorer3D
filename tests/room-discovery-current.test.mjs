import test from 'node:test';
import assert from 'node:assert/strict';
import { createUiRoomRoomActionsApi } from '../app/js/multiplayer/ui-room-room-actions.js';
function fixture(overrides = {}) {
  const state = { authUser: { uid: 'test' }, browseRooms: [], ...overrides.state };
  const status = [], browseStatus = [], activations = [];
  const refs = { titleBrowseCityInput: { value: '' } };
  const api = createUiRoomRoomActionsApi({ appCtx: {}, state, refs, callbacks: {},
    helpers: { normalizeCode: s => String(s).toUpperCase(), sanitizeText: s => s, normalizeCityKey: s => s.trim().toLowerCase(), pullCodeFromInputs: () => '', setInputCode: () => {} },
    renderers: { setStatus: (...s) => status.push(s), setBrowseStatus: (...s) => browseStatus.push(s), renderBrowseRooms: () => {}, closeRoomPanel: () => {} },
    runtime: { ensureAccessOrWarn: async () => true, refreshFeaturedRooms: async () => {} },
    activateRoom: async room => activations.push(room.code),
    deps: { findPublicRoomsByCity: async () => [], joinRoomByCode: async code => ({code}), bumpExplorerLeaderboard: async () => {}, ...overrides.deps }
  });
  return { api, state, refs, status, browseStatus, activations };
}
test('empty city browses all rooms and a failed request is not reported as no rooms', async () => {
  let query;
  const f = fixture({ deps: { findPublicRoomsByCity: async city => { query = city; return []; } } });
  await f.api.handleBrowseRooms();assert.equal(query, '');assert.equal(f.state.browsePhase, 'ready');
  assert.match(f.browseStatus.at(-1)[0], /Create a public room/);
  const broken = fixture({ deps: { findPublicRoomsByCity: async () => { throw Error('offline'); } } });
  await broken.api.handleBrowseRooms();assert.equal(broken.state.browsePhase, 'error');assert.match(broken.browseStatus.at(-1)[0],/could not be loaded/);
});
test('a late city response cannot overwrite the most recent browse request', async () => {
  const pending=[];const f=fixture({deps:{findPublicRoomsByCity:()=>new Promise(resolve=>pending.push(resolve))}});
  f.refs.titleBrowseCityInput.value='old';const first=f.api.handleBrowseRooms();
  f.refs.titleBrowseCityInput.value='new';const second=f.api.handleBrowseRooms();
  pending[1]([{code:'NEW'}]);await second;pending[0]([{code:'OLD'}]);await first;
  assert.equal(f.state.browseRooms[0].code,'NEW');assert.equal(f.state.browseCityKey,'new');
});
test('signed-out room selection opens sign-in and preserves the pending join', async()=>{
  const old=globalThis.document;let clicked=0;
  globalThis.document={getElementById:()=>({click:()=>clicked++})};
  try{const f=fixture({state:{authUser:null}});await f.api.handleJoinRoom('ABC123');assert.equal(clicked,1);assert.equal(f.state.pendingRoomCode,'ABC123');assert.equal(f.state.pendingRoomPrompted,false);assert.deepEqual(f.activations,[]);}finally{globalThis.document=old;}
});
test('duplicate joins are coalesced and an optional leaderboard error cannot undo admission',async()=>{
  let finish,calls=0;const f=fixture({deps:{joinRoomByCode:()=>{calls++;return new Promise(resolve=>finish=resolve);},bumpExplorerLeaderboard:async()=>{throw Error('unavailable');}}});
  const a=f.api.handleJoinRoom('ABC123');await Promise.resolve();const b=f.api.handleJoinRoom('ABC123');await Promise.resolve();
  assert.equal(calls,1);finish({code:'ABC123'});await Promise.all([a,b]);assert.deepEqual(f.activations,['ABC123']);assert.equal(f.state.roomJoinBusy,false);
});
