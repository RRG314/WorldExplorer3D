const crypto = require('node:crypto');
const { FieldValue, FieldPath } = require('firebase-admin/firestore');

const TRADEABLE_CATALOG_IDS = new Set([
  'brass-transit-token', 'iron-trade-buckle', 'copper-keepsake',
  'aluminum-trail-tag', 'sea-smoothed-disc', 'sea-glass-fragment',
  'expedition-clue-page'
]);

const ACCEPTED_DISCOVERY_EVIDENCE_CLASSES = new Set([
  'procedural-game-encounter',
  'guided-field-lead',
  'guided-exploration-lead',
  'guided-field-encounter',
  'guided-wildlife-encounter',
  'virtual-field-record',
  'virtual-fishing-catch',
  'virtual-wildlife-record'
]);

function stableId(value, max = 220) {
  const text = String(value || '').trim().slice(0, max);
  return /^[A-Za-z0-9][A-Za-z0-9:._%-]*$/.test(text) ? text : '';
}

function shortText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function itemDocumentId(claimId) {
  return crypto.createHash('sha256').update(String(claimId)).digest('hex').slice(0, 40);
}

function normalizeDiscoveryClaim(input = {}) {
  const claimId = stableId(input.claimId);
  const catalogId = stableId(input.catalogId, 100);
  const worldIdentity = stableId(input.worldIdentity);
  const activityId = stableId(input.activityId || 'inspect', 100);
  const evidenceClass = shortText(input.evidenceClass, 60);
  if (!claimId || !catalogId || !worldIdentity || !ACCEPTED_DISCOVERY_EVIDENCE_CLASSES.has(evidenceClass)) return null;
  return Object.freeze({
    claimId, catalogId, worldIdentity, activityId,
    recordKind: ['collection', 'observation'].includes(input.recordKind) ? input.recordKind : 'unknown',
    name: shortText(input.name || catalogId, 100),
    family: shortText(input.family || 'discovery', 60),
    rarityBand: ['common', 'uncommon', 'rare'].includes(input.rarityBand) ? input.rarityBand : 'common',
    qualityBand: shortText(input.qualityBand || 'observed', 40),
    evidenceClass,
    catalogVersion: shortText(input.catalogVersion || '2026.08.16.1', 40),
    tradeEligibleCatalog: TRADEABLE_CATALOG_IDS.has(catalogId)
  });
}

function normalizeTradeInput(input = {}) {
  const recipientUid = stableId(input.recipientUid, 128);
  const offeredItemIds = [...new Set((Array.isArray(input.offeredItemIds) ? input.offeredItemIds : []).map((id) => stableId(id, 80)).filter(Boolean))].slice(0, 12);
  const requestedItemIds = [...new Set((Array.isArray(input.requestedItemIds) ? input.requestedItemIds : []).map((id) => stableId(id, 80)).filter(Boolean))].slice(0, 12);
  if (!recipientUid || !offeredItemIds.length || !requestedItemIds.length) return null;
  return Object.freeze({ recipientUid, offeredItemIds, requestedItemIds });
}

function buildDiscoveryExports({ functions, setCors, verifyAuth, db, admin }) {
  const region = functions.region('us-central1');
  const serverTimestamp = () => FieldValue.serverTimestamp();

  const claimExplorerDiscovery = region.runWith({ invoker: 'public' }).https.onRequest(async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const auth = await verifyAuth(req, res);
    if (!auth) return;
    if (req.body?.expectedOwnerUid && req.body.expectedOwnerUid !== auth.uid) return res.status(409).json({ error: 'Account changed. Retry from the original account.' });
    const claim = normalizeDiscoveryClaim(req.body || {});
    if (!claim) return res.status(400).json({ error: 'Invalid discovery claim.' });
    try {
      const profileRef = db.collection('explorerProfiles').doc(auth.uid);
      const claimRef = profileRef.collection('claims').doc(itemDocumentId(claim.claimId));
      const itemRef = profileRef.collection('items').doc(itemDocumentId(claim.claimId));
      const result = await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(claimRef);
        if (existing.exists) {
          const stored = await transaction.get(itemRef);
          if (!stored.exists || stored.data().catalogId !== claim.catalogId || stored.data().ownerUid !== auth.uid) {
            throw Object.assign(new Error('Existing discovery receipt requires reconciliation.'), {status:409});
          }
          const item = stored.data();
          return { awarded:false, itemId:itemRef.id, authority:item.authority,
            tradeable:item.authority === 'trusted-server' && item.tradeable === true,
            recordKind:item.recordKind || 'unknown' };
        }
        const independentlyValidated = auth.admin === true;
        const item = {
          ...claim,
          instanceId: itemRef.id,
          ownerUid: auth.uid,
          authority: independentlyValidated ? 'trusted-server' : 'server-receipt',
          tradeable: independentlyValidated && claim.tradeEligibleCatalog,
          lockedByTradeId: null,
          createdAt: serverTimestamp()
        };
        transaction.set(profileRef, { uid: auth.uid, schemaVersion: 1, updatedAt: serverTimestamp() }, { merge: true });
        transaction.create(itemRef, item);
        transaction.create(claimRef, { claimId: claim.claimId, itemId: itemRef.id, catalogId: claim.catalogId, createdAt: serverTimestamp() });
        return { awarded:true, itemId:itemRef.id, authority:item.authority, tradeable:item.tradeable, recordKind:item.recordKind };
      });
      return res.status(200).json({
        ...result,
        ownerUid: auth.uid,
        claimId: claim.claimId,
        catalogId: claim.catalogId
      });
    } catch (error) {
      if (error.status === 409) return res.status(409).json({error:error.message});
      console.error('[claimExplorerDiscovery] failed:', error);
      return res.status(500).json({ error: 'Could not issue a trusted discovery receipt.' });
    }
  });

  const createDiscoveryTrade = region.runWith({ invoker: 'public' }).https.onRequest(async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const auth = await verifyAuth(req, res);
    if (!auth) return;
    const trade = normalizeTradeInput(req.body || {});
    if (!trade || trade.recipientUid === auth.uid) return res.status(400).json({ error: 'Invalid trade offer.' });
    try {
      const tradeRef = db.collection('discoveryTrades').doc();
      await db.runTransaction(async (transaction) => {
        const offeredRefs = trade.offeredItemIds.map((id) => db.collection('explorerProfiles').doc(auth.uid).collection('items').doc(id));
        const offered = await Promise.all(offeredRefs.map((ref) => transaction.get(ref)));
        if (offered.some((snapshot) => !snapshot.exists || snapshot.data().ownerUid !== auth.uid || snapshot.data().tradeable !== true || snapshot.data().lockedByTradeId)) {
          throw new Error('offered-item-ineligible');
        }
        offeredRefs.forEach((ref) => transaction.update(ref, { lockedByTradeId: tradeRef.id, updatedAt: serverTimestamp() }));
        transaction.create(tradeRef, {
          ownerUid: auth.uid,
          recipientUid: trade.recipientUid,
          offeredItemIds: trade.offeredItemIds,
          requestedItemIds: trade.requestedItemIds,
          status: 'pending', revision: 1,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
      });
      return res.status(200).json({ tradeId: tradeRef.id, status: 'pending' });
    } catch (error) {
      const code = error?.message === 'offered-item-ineligible' ? 409 : 500;
      return res.status(code).json({ error: code === 409 ? 'One or more offered items are unavailable.' : 'Could not create trade.' });
    }
  });

  const listExplorerDiscoveries = region.runWith({ invoker: 'public' }).https.onRequest(async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const auth = await verifyAuth(req, res);
    if (!auth) return;
    try {
      if (req.body?.expectedOwnerUid && req.body.expectedOwnerUid !== auth.uid) return res.status(409).json({ error: 'Account changed. Reload receipts for the current account.' });
      const cursor = req.body?.cursor;
      if (cursor != null && (typeof cursor !== 'string' || !/^[a-f0-9]{40}$/.test(cursor))) return res.status(400).json({ error: 'Invalid receipt cursor.' });
      let query = db.collection('explorerProfiles').doc(auth.uid).collection('items').orderBy(FieldPath.documentId());
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.limit(251).get();
      const pageDocs = snapshot.docs.slice(0, 250);
      const items = pageDocs.map((doc) => {
        const item = doc.data() || {};
        return {
          itemId: doc.id,
          recordKind: item.recordKind || 'unknown',
          ownerUid: auth.uid,
          createdAtMs: item.createdAt?.toMillis?.() || null,
          instanceId: item.instanceId || doc.id,
          claimId: item.claimId,
          catalogId: item.catalogId,
          worldIdentity: item.worldIdentity,
          activityId: item.activityId,
          evidenceClass: item.evidenceClass,
          name: item.name,
          family: item.family,
          rarityBand: item.rarityBand,
          qualityBand: item.qualityBand,
          authority: item.authority,
          tradeable: item.tradeable === true,
          lockedByTradeId: item.lockedByTradeId || null
        };
      });
      return res.status(200).json({ items, ownerUid: auth.uid, nextCursor: snapshot.docs.length > 250 ? pageDocs.at(-1).id : null, schemaVersion: 2 });
    } catch (error) {
      console.error('[listExplorerDiscoveries] failed:', error);
      return res.status(500).json({ error: 'Could not load discovery receipts.' });
    }
  });

  const acceptDiscoveryTrade = region.runWith({ invoker: 'public' }).https.onRequest(async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const auth = await verifyAuth(req, res);
    if (!auth) return;
    const tradeId = stableId(req.body?.tradeId, 80);
    if (!tradeId) return res.status(400).json({ error: 'Invalid trade id.' });
    try {
      const tradeRef = db.collection('discoveryTrades').doc(tradeId);
      await db.runTransaction(async (transaction) => {
        const tradeSnap = await transaction.get(tradeRef);
        const trade = tradeSnap.data() || {};
        if (!tradeSnap.exists || trade.status !== 'pending' || trade.recipientUid !== auth.uid) throw new Error('trade-unavailable');
        const ownerProfile = db.collection('explorerProfiles').doc(trade.ownerUid);
        const recipientProfile = db.collection('explorerProfiles').doc(auth.uid);
        const offeredRefs = trade.offeredItemIds.map((id) => ownerProfile.collection('items').doc(id));
        const requestedRefs = trade.requestedItemIds.map((id) => recipientProfile.collection('items').doc(id));
        const offeredDestinationRefs = trade.offeredItemIds.map((id) => recipientProfile.collection('items').doc(id));
        const requestedDestinationRefs = trade.requestedItemIds.map((id) => ownerProfile.collection('items').doc(id));
        const [offered, requested] = await Promise.all([
          Promise.all(offeredRefs.map((ref) => transaction.get(ref))),
          Promise.all(requestedRefs.map((ref) => transaction.get(ref)))
        ]);
        const [offeredDestinations, requestedDestinations] = await Promise.all([
          Promise.all(offeredDestinationRefs.map((ref) => transaction.get(ref))),
          Promise.all(requestedDestinationRefs.map((ref) => transaction.get(ref)))
        ]);
        if (offered.some((snap) => !snap.exists || snap.data().lockedByTradeId !== tradeId || snap.data().tradeable !== true)) throw new Error('trade-unavailable');
        if (requested.some((snap) => !snap.exists || snap.data().ownerUid !== auth.uid || snap.data().tradeable !== true || snap.data().lockedByTradeId)) throw new Error('trade-unavailable');
        if (offeredDestinations.some((snap) => snap.exists) || requestedDestinations.some((snap) => snap.exists)) throw new Error('trade-unavailable');
        offered.forEach((snap) => {
          transaction.set(recipientProfile.collection('items').doc(snap.id), { ...snap.data(), ownerUid: auth.uid, lockedByTradeId: null, updatedAt: serverTimestamp() });
          transaction.delete(snap.ref);
        });
        requested.forEach((snap) => {
          transaction.set(ownerProfile.collection('items').doc(snap.id), { ...snap.data(), ownerUid: trade.ownerUid, lockedByTradeId: null, updatedAt: serverTimestamp() });
          transaction.delete(snap.ref);
        });
        transaction.update(tradeRef, { status: 'completed', revision: Number(trade.revision || 1) + 1, completedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      });
      return res.status(200).json({ tradeId, status: 'completed' });
    } catch (error) {
      const code = error?.message === 'trade-unavailable' ? 409 : 500;
      return res.status(code).json({ error: code === 409 ? 'This trade is stale or unavailable.' : 'Could not accept trade.' });
    }
  });

  const cancelDiscoveryTrade = region.runWith({ invoker: 'public' }).https.onRequest(async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const auth = await verifyAuth(req, res);
    if (!auth) return;
    const tradeId = stableId(req.body?.tradeId, 80);
    if (!tradeId) return res.status(400).json({ error: 'Invalid trade id.' });
    try {
      const tradeRef = db.collection('discoveryTrades').doc(tradeId);
      await db.runTransaction(async (transaction) => {
        const tradeSnap = await transaction.get(tradeRef);
        const trade = tradeSnap.data() || {};
        if (!tradeSnap.exists || trade.status !== 'pending' || ![trade.ownerUid, trade.recipientUid].includes(auth.uid)) {
          throw new Error('trade-unavailable');
        }
        const ownerProfile = db.collection('explorerProfiles').doc(trade.ownerUid);
        const offeredRefs = (trade.offeredItemIds || []).map((id) => ownerProfile.collection('items').doc(id));
        const offered = await Promise.all(offeredRefs.map((ref) => transaction.get(ref)));
        offered.forEach((snapshot) => {
          if (snapshot.exists && snapshot.data().lockedByTradeId === tradeId) {
            transaction.update(snapshot.ref, { lockedByTradeId: null, updatedAt: serverTimestamp() });
          }
        });
        transaction.update(tradeRef, {
          status: 'canceled',
          revision: Number(trade.revision || 1) + 1,
          canceledAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      return res.status(200).json({ tradeId, status: 'canceled' });
    } catch (error) {
      const code = error?.message === 'trade-unavailable' ? 409 : 500;
      return res.status(code).json({ error: code === 409 ? 'This trade is stale or unavailable.' : 'Could not cancel trade.' });
    }
  });

  return { claimExplorerDiscovery, listExplorerDiscoveries, createDiscoveryTrade, acceptDiscoveryTrade, cancelDiscoveryTrade };
}

module.exports = {
  ACCEPTED_DISCOVERY_EVIDENCE_CLASSES,
  TRADEABLE_CATALOG_IDS,
  buildDiscoveryExports,
  itemDocumentId,
  normalizeDiscoveryClaim,
  normalizeTradeInput,
  stableId
};
