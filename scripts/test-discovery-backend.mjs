import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  itemDocumentId,
  normalizeDiscoveryClaim,
  normalizeTradeInput,
  stableId
} = require('../functions/discovery.js');

assert.equal(stableId('claim:world:item'), 'claim:world:item');
assert.equal(stableId('../unsafe path'), '');
const claim = normalizeDiscoveryClaim({
  claimId: 'claim:world:v1:item-1',
  catalogId: 'brass-transit-token',
  worldIdentity: 'world-identity:v1:earth:1:2:test:fixed',
  activityId: 'metal-detect',
  evidenceClass: 'procedural-game-encounter',
  name: 'Brass Transit Token',
  rarityBand: 'uncommon'
});
assert.equal(claim.tradeEligibleCatalog, true);
assert.equal(claim.tradeable, undefined, 'catalog eligibility alone must not grant trade authority');
assert.equal(claim.authority, undefined, 'authority is assigned only by the trusted transaction');
assert.equal(normalizeDiscoveryClaim({ ...claim, evidenceClass: 'observed-regionally' }), null, 'clients cannot mint exact factual occurrence claims');
assert.equal(itemDocumentId(claim.claimId), itemDocumentId(claim.claimId), 'receipt IDs must be idempotent');
assert.equal(itemDocumentId(claim.claimId).length, 40);
assert.deepEqual(normalizeTradeInput({
  recipientUid: 'user_2',
  offeredItemIds: ['a', 'a', 'b'],
  requestedItemIds: ['c']
}), { recipientUid: 'user_2', offeredItemIds: ['a', 'b'], requestedItemIds: ['c'] });
assert.equal(normalizeTradeInput({ recipientUid: 'user_2', offeredItemIds: [], requestedItemIds: ['c'] }), null);

console.log(JSON.stringify({ ok: true, claimId: claim.claimId, itemDocumentId: itemDocumentId(claim.claimId) }, null, 2));
