'use strict';
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {
  JOURNEY_MAX_BYTES, JOURNEY_CHUNK_BYTES, validateJourneyEnvelope, journeySaveSummary,canonicalJourneyText
} = require('./generated/journey-format.cjs');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = (status, reason) => { throw Object.assign(new Error(reason), {status, reason}); };
const validUid = uid => typeof uid === 'string' && uid.length>0&&uid.length<=128&&!/[\/\u0000-\u001f\u007f]/.test(uid);
const prefix = (uid, id = '') => `player-journeys/${digest(Buffer.from(uid))}/${id ? id + '/' : ''}`;
function checkedHead(value){
  if(!value)return {schemaVersion:1,revision:0};
  if(value.schemaVersion!==1||!Number.isSafeInteger(value.revision)||value.revision<0)fail(409,'journey_update_required');
  return value;
}

function validateUpload(input) {
  if (!UUID.test(input.uploadId || '') || !UUID.test(input.clientId || '') ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
      !Number.isSafeInteger(input.totalBytes) || input.totalBytes < 2 || input.totalBytes > JOURNEY_MAX_BYTES ||
      !HASH.test(input.digest || '') || !['json', 'gzip'].includes(input.encoding)) fail(400, 'invalid_journey_upload');
  return {
    snapshotId: input.uploadId, clientId: input.clientId, baseRevision: input.expectedRevision,
    totalBytes: input.totalBytes, chunkCount: Math.ceil(input.totalBytes / JOURNEY_CHUNK_BYTES),
    digest: input.digest, encoding: input.encoding
  };
}
function equalUpload(a, b) {
  return ['snapshotId','clientId','baseRevision','totalBytes','digest','encoding'].every(key => a[key] === b[key]);
}
function parseEnvelope(buffer, encoding, uid) {
  let raw;
  try {raw = encoding === 'gzip' ? zlib.gunzipSync(buffer, {maxOutputLength: JOURNEY_MAX_BYTES}) : buffer;}
  catch {fail(422, 'journey_compression_invalid');}
  if (raw.length > JOURNEY_MAX_BYTES) fail(413, 'journey_too_large');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{fail(422,'journey_format_invalid');}
  // Bound object expansion before parsing. Base64 photographs are strings and
  // do not consume this structural budget. No records are silently truncated.
  let quoted = false, escaped = false, structure = 0, depth = 0;
  for (const char of text) {
    if (quoted) {if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false;}
    else if (char === '"') quoted = true;
    else if ('[{,:'.includes(char)) {
      structure++; if (char === '[' || char === '{') depth++;
      if (structure > 1000000 || depth > 80) fail(413, 'journey_structure_too_large');
    } else if (char === ']' || char === '}') depth--;
  }
  try {return validateJourneyEnvelope(JSON.parse(text), uid);}
  catch {fail(422, 'journey_format_invalid');}
}

function createJourneyAuthority({db, bucket, now = Date.now}) {
  const reference = uid => db.collection('users').doc(uid).collection('gameplay').doc('personalJourney');
  async function collect(uid) {
    const ref = reference(uid), snap = await ref.get(), ids = checkedHead(snap.data()).garbage || [];
    const removed = [];
    for (const id of ids) {
      if (!UUID.test(id)) continue;
      try {await bucket.deleteFiles({prefix: prefix(uid, id)}); removed.push(id);} catch { /* Retry on the next bounded save. */ }
    }
    if (removed.length) await db.runTransaction(async tx => {
      const state = (await tx.get(ref)).data();
      if (state) tx.set(ref, {...state, garbage: (state.garbage || []).filter(id => !removed.includes(id))});
    });
  }
  async function handle(uid, input = {}) {
    if (!validUid(uid)) fail(401, 'invalid_journey_owner');
    const ref = reference(uid), action = input.action;
    if (action === 'head') {
      const state = checkedHead((await ref.get()).data());
      return {schemaVersion:1,ownerUid: uid, revision: state.revision, current: state.current || null, previous: state.previous || null,
        saving:state.pending?{snapshotId:state.pending.snapshotId,clientId:state.pending.clientId,expiresAtMs:state.pending.expiresAtMs,digest:state.pending.digest}:null};
    }
    if(action==='abandon')return db.runTransaction(async tx=>{
      const state=checkedHead((await tx.get(ref)).data());
      if(!state.pending)return {ownerUid:uid,abandoned:true};
      if(state.revision!==input.expectedRevision||state.pending.snapshotId!==input.uploadId||state.pending.clientId!==input.clientId)fail(409,'journey_save_in_progress');
      tx.set(ref,{...state,pending:null,garbage:[...(state.garbage||[]),state.pending.snapshotId]});
      return {ownerUid:uid,abandoned:true};
    });
    if (action === 'begin') {
      const upload = validateUpload(input);
      await collect(uid);
      return db.runTransaction(async tx => {
        const state = checkedHead((await tx.get(ref)).data());
        if (state.current?.snapshotId === upload.snapshotId) {
          if (state.current.digest !== upload.digest) fail(409, 'journey_upload_identity_reused');
          return {ownerUid: uid, committed: true, current: state.current};
        }
        if (state.pending?.snapshotId === upload.snapshotId) {
          if (!equalUpload(state.pending, upload)) fail(409, 'journey_upload_identity_reused');
          return {ownerUid: uid, pending: state.pending};
        }
        if (state.revision !== upload.baseRevision) fail(409, 'journey_revision_changed');
        if (state.pending && state.pending.expiresAtMs > now()) fail(409, 'journey_save_in_progress');
        if ((state.garbage || []).length >= 20) fail(503, 'journey_cleanup_pending');
        if (state.lastBeginAtMs && now() - state.lastBeginAtMs < 2000) fail(429, 'journey_save_too_soon');
        const pending = {...upload, startedAtMs: now(), expiresAtMs: now() + 15 * 60 * 1000};
        tx.set(ref, {...state, pending, lastBeginAtMs: now(),
          garbage: [...(state.garbage || []), ...(state.pending ? [state.pending.snapshotId] : [])]});
        return {ownerUid: uid, pending};
      });
    }
    if (action === 'chunk') {
      const state = checkedHead((await ref.get()).data()), upload = state.pending;
      if (!upload || upload.snapshotId !== input.uploadId || upload.expiresAtMs <= now()) fail(409, 'journey_upload_expired');
      const index = input.index, encoded = input.data;
      if (!Number.isSafeInteger(index) || index < 0 || index >= upload.chunkCount ||
          typeof encoded !== 'string' || encoded.length > Math.ceil(JOURNEY_CHUNK_BYTES / 3) * 4 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) fail(400, 'invalid_journey_chunk');
      const bytes = Buffer.from(encoded, 'base64'), expected = Math.min(JOURNEY_CHUNK_BYTES, upload.totalBytes - index * JOURNEY_CHUNK_BYTES);
      if (bytes.length !== expected || bytes.toString('base64') !== encoded) fail(400, 'invalid_journey_chunk_size');
      const hash = digest(bytes), file = bucket.file(prefix(uid, upload.snapshotId) + index + '.bin');
      try {
        await file.save(bytes, {resumable: false, preconditionOpts: {ifGenerationMatch: 0}, metadata: {
          contentType: 'application/octet-stream', cacheControl: 'private, no-store, max-age=0',
          metadata: {sha256: hash}
        }});
      } catch (error) {
        if (![409, 412].includes(Number(error.code))) throw error;
        const [metadata] = await file.getMetadata();
        if (metadata.metadata?.sha256 !== hash || Number(metadata.size) !== expected || metadata.metadata?.firebaseStorageDownloadTokens) fail(409, 'journey_chunk_identity_reused');
      }
      return {ownerUid: uid, uploadId: upload.snapshotId, index, digest: hash};
    }
    if (action === 'commit') {
      const state = checkedHead((await ref.get()).data()), upload = state.pending;
      if (state.current?.snapshotId === input.uploadId) return {ownerUid: uid, current: state.current, committed: true};
      if (!upload || upload.snapshotId !== input.uploadId || upload.expiresAtMs <= now()) fail(409, 'journey_upload_expired');
      const chunks = [];
      for (let index = 0; index < upload.chunkCount; index++) {
        try {const [bytes] = await bucket.file(prefix(uid, upload.snapshotId) + index + '.bin').download(); chunks.push(bytes);}
        catch (error) {if (Number(error.code) === 404) fail(422, 'journey_chunk_missing'); throw error;}
      }
      const bytes = Buffer.concat(chunks);chunks.length=0;
      if (bytes.length !== upload.totalBytes || digest(bytes) !== upload.digest) fail(422, 'journey_checksum_mismatch');
      const envelope = parseEnvelope(bytes, upload.encoding, uid), summary = journeySaveSummary(envelope);
      const result = await db.runTransaction(async tx => {
        const latest = checkedHead((await tx.get(ref)).data());
        if (latest.current?.snapshotId === input.uploadId) return {ownerUid: uid, current: latest.current, committed: true};
        if (latest.revision !== upload.baseRevision || !latest.pending || !equalUpload(latest.pending, upload)) fail(409, 'journey_revision_changed');
        const current = {snapshotId: upload.snapshotId, revision: latest.revision + 1,
          totalBytes: upload.totalBytes, chunkCount: upload.chunkCount, digest: upload.digest,
          encoding: upload.encoding, updatedAtMs: now(), summary,logicalDigest:digest(Buffer.from(canonicalJourneyText(envelope)))};
        tx.set(ref, {...latest, revision: current.revision, current, previous: latest.current || null, pending: null,
          garbage: [...(latest.garbage || []), ...(latest.previous ? [latest.previous.snapshotId] : [])]});
        return {ownerUid: uid, current, committed: true};
      });
      await collect(uid);
      return result;
    }
    if (action === 'download') {
      const state = checkedHead((await ref.get()).data()), saved = [state.current, state.previous].find(row => row?.snapshotId === input.snapshotId);
      if (!saved) fail(404, 'journey_save_unavailable');
      if (!Number.isSafeInteger(input.index) || input.index < 0 || input.index >= saved.chunkCount) fail(400, 'invalid_journey_chunk');
      const [bytes] = await bucket.file(prefix(uid, saved.snapshotId) + input.index + '.bin').download();
      return {ownerUid: uid, snapshotId: saved.snapshotId, index: input.index, data: bytes.toString('base64')};
    }
    fail(400, 'invalid_journey_action');
  }
  return {handle, async cleanup(uid) {if (!validUid(uid)) fail(400, 'invalid_journey_owner'); await bucket.deleteFiles({prefix: prefix(uid)});}};
}
module.exports = {createJourneyAuthority, validateUpload, parseEnvelope};
