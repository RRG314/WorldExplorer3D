import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

// Run the real transport, API payload builders and connected owners. Only SDK,
// authentication and HTTP boundaries are controlled; no account records are used.
async function fixture(entry = 'js/function-api.js') {
  const state = { user: { uid: 'account-a' }, calls: [], subscriptions: [], changes: 0, errors: 0,
    token: async () => 'fixture-token', attestation: async () => 'fixture-check',
    response: async () => Response.json({ accepted: true, credits: 50, requestId: 'receipt-a' }) };
  const context = vm.createContext({ console, AbortController, setTimeout, clearTimeout, Date, Math, Set, Map,
    fetch: async (url, options) => { state.calls.push({ url, body: JSON.parse(options.body) }); return state.response(url, options); } });
  const sdk = {
    doc: (_db, ...segments) => segments.join('/'), collection: (_db, name) => name,
    limit: n => ({ limit: n }), where: (...args) => ({ where: args }), query: (...args) => args,
    onSnapshot: (ref, next, error) => { const record = { ref, next, error, stopped: false }; state.subscriptions.push(record); return () => { record.stopped = true; }; }
  };
  const stubs = {
    'js/auth-ui.js': { getCurrentUser: () => state.user, getCurrentUserToken: (...args) => state.token(...args) },
    'js/firebase-init.js': { initFirebase: () => ({ db: {} }), getFirebaseAppCheckToken: () => state.attestation(), readFirebaseConfig: () => ({ projectId: 'fixture-project' }) },
    'js/firebase-environment-policy.js': { assertFunctionsOrigin: value => value }
  };
  const cache = new Map();
  async function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = file.startsWith('https://') ? sdk : stubs[file];
    const module = exports ? new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context, identifier: file }) : new vm.SourceTextModule(await readFile(path.join(root, file), 'utf8'), { context, identifier: file });
    cache.set(file, module);
    await module.link((spec, parent) => load(spec.startsWith('https://') ? spec : path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), spec.split('?')[0]))));
    return module;
  }
  const module = await load(entry); await module.evaluate();
  return { state, api: module.namespace, options: { onChange: () => { state.changes++; }, onError: () => { state.errors++; } } };
}

for (const stage of ['token', 'attestation']) test(`protected request retains account through ${stage} acquisition`, async () => {
  const f = await fixture(), waiting = deferred(), started = deferred();
  f.state[stage] = () => { started.resolve(); return waiting.promise; };
  const request = f.api.postProtectedFunction('/write', {});
  await started.promise; f.state.user = { uid: 'account-b' }; waiting.resolve('fixture-value');
  await assert.rejects(request, e => e.code === 'account-changed' && e.outcomeUnknown === false);
  assert.equal(f.state.calls.length, 0);
});
test('old successful reply cannot confirm a new account action', async () => {
  const f = await fixture();
  f.state.response = async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), text: async () => {
    f.state.user = { uid: 'account-b' }; return JSON.stringify({ accepted: true });
  } });
  await assert.rejects(f.api.postProtectedFunction('/write'), e => e.code === 'account-changed' && e.outcomeUnknown === true);
  assert.equal(f.state.calls.length, 1);
});
test('account change after routing miss never dispatches fallback', async () => {
  const f = await fixture(); f.state.response = async () => { f.state.user = null; return new Response('No route', { status: 404 }); };
  await assert.rejects(f.api.postProtectedFunction('/write'), e => e.code === 'account-changed' && e.outcomeUnknown === false);
  assert.equal(f.state.calls.length, 1);
});
test('same-account success and public App Check calls retain their contract', async () => {
  const f = await fixture(); assert.equal((await f.api.postProtectedFunction('/write')).accepted, true);
  f.state.user = null; assert.equal((await f.api.postAppCheckedFunction('/read')).accepted, true);
  assert.equal(f.state.calls.length, 2);
});
for (const [entry, method, input] of [
  ['js/economy-api.js', 'commitExplorerCommerceAction', { storeId: 'store', catalogId: 'water', action: 'buy' }],
  ['js/economy-api.js', 'settleExplorerCommerceOutcome', { requestId: 'receipt', outcome: 'applied' }],
  ['js/property-api.js', 'commitWorldPropertyAction', { worldSeed: 'baltimore', action: 'buy' }],
  ['js/property-api.js', 'commitWorldPropertyTradeAction', { worldSeed: 'baltimore', action: 'trade_accept' }]
]) test(`${method} forwards captured account as transport policy, not payload`, async () => {
  const f = await fixture(entry); f.state.user = { uid: 'account-b' };
  await assert.rejects(f.api[method]({ ...input, expectedUserId: 'account-a' }), e => e.code === 'account-changed' && !e.outcomeUnknown);
  assert.equal(f.state.calls.length, 0);
  await f.api[method]({ ...input, expectedUserId: 'account-b' });
  assert.equal('expectedUserId' in f.state.calls[0].body, false);
});

for (const kind of ['wallet', 'property']) {
  const entry = kind === 'wallet' ? 'app/js/economy/connected-wallet-authority.js' : 'app/js/real-estate/connected-property-authority.js';
  async function owner() {
    const f = await fixture(entry);
    const api = kind === 'wallet' ? f.api.createConnectedExplorerWallet(f.options) : f.api.createConnectedPropertyAuthority({ ...f.options, worldSeed: 'baltimore', locationId: 'baltimore' });
    const mutate = () => kind === 'wallet' ? api.transact('buy', { id: 'shop' }, 'water') : api.buy({ worldPropertyId: 'home', sharedEligible: true });
    return { ...f, owner: api, mutate };
  }
  test(`${kind} cached owner cannot send a mutation as the replacement account`, async () => {
    const f = await owner(); f.state.user = { uid: 'account-b' };
    const result = await f.mutate(); assert.equal(result.accepted, false); assert.equal(f.state.calls.length, 0); f.owner.dispose();
  });
  test(`${kind} ignores queued old-account snapshots and errors`, async () => {
    const f = await owner(), before = JSON.stringify(f.owner.snapshot()); f.state.user = { uid: 'account-b' };
    for (const sub of f.state.subscriptions) {
      sub.next({ exists: () => true, data: () => ({ credits: 7, currencyVersion: 2 }), docs: [] }); sub.error(new Error('old listener'));
    }
    assert.equal(JSON.stringify(f.owner.snapshot()), before); assert.equal(f.state.changes, 0); assert.equal(f.state.errors, 0); f.owner.dispose();
  });
  test(`${kind} disposal silences listener failures and stops every subscription`, async () => {
    const f = await owner(); f.owner.dispose(); f.owner.dispose();
    for (const sub of f.state.subscriptions) sub.error(new Error('late error'));
    assert.equal(f.state.errors, 0); assert.ok(f.state.subscriptions.every(s => s.stopped));
    assert.equal((await f.mutate()).accepted, false); assert.equal(f.state.calls.length, 0);
  });
  test(`${kind} current legacy and v2 wallet balances are preserved`, async () => {
    const f = await owner(), wallet = f.state.subscriptions.find(s => String(s.ref).endsWith('/economy/wallet'));
    for (const [data, expected] of [[{ credits: 5, currencyVersion: 1 }, 10000], [{ credits: 42, currencyVersion: 2 }, 42]]) {
      wallet.next({ exists: () => true, data: () => data }); assert.equal(f.owner.snapshot().credits, expected);
    }
    assert.equal((await f.mutate()).accepted, true); f.owner.dispose();
  });
}
