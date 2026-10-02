import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { buildDiscoveryExports } = require('../functions/discovery.js');

function documentRef(path) {
  return {
    path,
    id: path.split('/').at(-1),
    collection(name) { return collectionRef(`${path}/${name}`); }
  };
}

function collectionRef(path) {
  return {
    path,
    doc(id = `auto-${path.length}`) { return documentRef(`${path}/${id}`); }
  };
}

function createEndpoint({ existing = false, isAdmin = false } = {}) {
  const writes = [];
  let transactionRuns = 0;
  const db = {
    collection(name) { return collectionRef(name); },
    async runTransaction(callback) {
      transactionRuns += 1;
      return callback({
        async get(ref) {
          return existing
            ? { exists:true, data:()=>ref.path.includes('/items/') ? {catalogId:'taxon-1',ownerUid:'explorer-1',authority:'server-receipt',tradeable:false} : {itemId:ref.id} }
            : { exists: false, data: () => null };
        },
        set(ref, value, options) { writes.push({ operation: 'set', path: ref.path, value, options }); },
        create(ref, value) { writes.push({ operation: 'create', path: ref.path, value }); }
      });
    }
  };
  const functions = {
    region() {
      return { runWith() { return this; }, https: { onRequest: (handler) => handler } };
    }
  };
  const { claimExplorerDiscovery } = buildDiscoveryExports({
    functions,
    setCors: () => false,
    verifyAuth: async () => ({ uid: 'explorer-1', admin: isAdmin }),
    db,
    admin: {}
  });
  return { claimExplorerDiscovery, writes, transactionRuns: () => transactionRuns };
}

function responseCapture() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

const baseClaim = {
  claimId: 'claim:release:field-lead-1',
  catalogId: 'taxon-1',
  worldIdentity: 'world:baltimore',
  activityId: 'photograph',
  name: 'Field record'
};

test('signed-in current evidence creates one non-tradeable server receipt', async () => {
  for (const evidenceClass of ['guided-field-lead', 'guided-exploration-lead', 'virtual-fishing-catch']) {
    const endpoint = createEndpoint();
    const res = responseCapture();
    await endpoint.claimExplorerDiscovery({ method: 'POST', body: { ...baseClaim, claimId: `${baseClaim.claimId}:${evidenceClass}`, evidenceClass } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.awarded, true);
    assert.equal(res.body.authority, 'server-receipt');
    assert.equal(res.body.tradeable, false);
    assert.equal(endpoint.transactionRuns(), 1);
    const itemWrite = endpoint.writes.find((entry) => entry.operation === 'create' && entry.path.includes('/items/'));
    assert.equal(itemWrite?.value?.evidenceClass, evidenceClass);
    assert.equal(itemWrite?.value?.ownerUid, 'explorer-1');
    assert.equal(itemWrite?.value?.tradeable, false);
  }
});

test('unknown evidence is rejected before any receipt transaction', async () => {
  const endpoint = createEndpoint();
  const res = responseCapture();
  await endpoint.claimExplorerDiscovery({ method: 'POST', body: { ...baseClaim, evidenceClass: 'anything-goes' } }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Invalid discovery claim.' });
  assert.equal(endpoint.transactionRuns(), 0);
  assert.deepEqual(endpoint.writes, []);
});

test('repeated claim IDs return the existing receipt without duplicate writes', async () => {
  const endpoint = createEndpoint({ existing: true });
  const res = responseCapture();
  await endpoint.claimExplorerDiscovery({ method: 'POST', body: { ...baseClaim, evidenceClass: 'guided-field-lead' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.awarded, false);
  assert.match(res.body.itemId, /^[a-f0-9]{40}$/);
  assert.deepEqual(endpoint.writes, []);
});

function listingEndpoint() {
  const queries=[];
  const ids=Array.from({length:501},(_,i)=>i.toString(16).padStart(40,'0'));
  const db={collection(name){assert.equal(name,'explorerProfiles');return {doc(uid){assert.equal(uid,'explorer-1');return {collection(kind){assert.equal(kind,'items');let after='';return {orderBy(field){assert.ok(field);return this},startAfter(cursor){after=cursor;return this},limit(count){assert.equal(count,251);return this},async get(){queries.push(after);return {docs:ids.filter(id=>!after||id>after).slice(0,251).map(id=>({id,data:()=>({claimId:`claim:${id}`,catalogId:'rock',authority:'server-receipt'})}))}}}}}}}}};
  const functions={region(){return {runWith(){return this},https:{onRequest:h=>h}}}};
  return {handler:buildDiscoveryExports({functions,setCors:()=>false,verifyAuth:async()=>({uid:'explorer-1'}),db,admin:{}}).listExplorerDiscoveries,queries};
}
test('receipt endpoint pages 501 documents without omissions and binds pages to the authenticated owner',async()=>{
 const {handler,queries}=listingEndpoint();const seen=[];let cursor=null;
 do {const res=responseCapture();await handler({method:'POST',body:{cursor,expectedOwnerUid:'explorer-1'}},res);assert.equal(res.statusCode,200);assert.equal(res.body.ownerUid,'explorer-1');seen.push(...res.body.items.map(i=>i.itemId));assert.ok(res.body.items.every(i=>i.ownerUid==='explorer-1'));cursor=res.body.nextCursor;}while(cursor);
 assert.equal(seen.length,501);assert.equal(new Set(seen).size,501);assert.equal(queries.length,3);
});
test('receipt endpoint rejects another owner and malformed cursors before querying',async()=>{
 const {handler,queries}=listingEndpoint();
 for(const body of [{expectedOwnerUid:'other'},{cursor:'../other'},{cursor:42}]){const res=responseCapture();await handler({method:'POST',body},res);assert.ok([400,409].includes(res.statusCode));}
 assert.equal(queries.length,0);
});
test('receipt creation rejects account changes before writing',async()=>{
 const endpoint=createEndpoint();const res=responseCapture();await endpoint.claimExplorerDiscovery({method:'POST',body:{...baseClaim,evidenceClass:'guided-field-lead',expectedOwnerUid:'other'}},res);
 assert.equal(res.statusCode,409);assert.equal(endpoint.transactionRuns(),0);
});

test('replaying after account privileges change preserves original receipt authority', async () => {
  const endpoint=createEndpoint({existing:true,isAdmin:true});const res=responseCapture();
  await endpoint.claimExplorerDiscovery({method:'POST',body:{...baseClaim,evidenceClass:'virtual-field-record'}},res);
  assert.equal(res.statusCode,200);assert.equal(res.body.authority,'server-receipt');assert.equal(res.body.tradeable,false);
});
