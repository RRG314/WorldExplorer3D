import { validateAlbumPhoto } from './three-views.js';
// Readers limited to the old file version must reject media-bearing backups,
// rather than clear profile siblings whose pixels they do not understand.
export const RESEARCH_MEDIA_BACKUP_VERSION = 6;
export const RESEARCH_MEDIA_PREFIX = 'research-media:';
const clone = (value) => JSON.parse(JSON.stringify(value));
const hash = async (data) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
export function researchPhotoId(careerId, runId, slot) {
  if (
    !/^[a-z][a-z-]{1,40}$/.test(careerId) ||
    !/^[a-zA-Z0-9-]{8,64}$/.test(runId) ||
    !/^[a-z][a-z-]{1,32}$/.test(slot)
  )
    throw Error('This field photograph has an invalid identity.');
  return `${RESEARCH_MEDIA_PREFIX}${careerId}:${runId}:${slot}`;
}
export function researchMediaProfileRows(rows) {
  return (rows || [])
    .filter((row) => typeof row?.id === 'string' && row.id.startsWith(RESEARCH_MEDIA_PREFIX))
    .map(clone);
}
export function validateResearchMediaRecord(record) {
  if (!record || !record.id?.startsWith(RESEARCH_MEDIA_PREFIX))
    throw Error('This field photograph has an invalid identity.');
  if (!Number.isInteger(record.schemaVersion) || record.schemaVersion < 1)
    throw Error('This field photograph has an invalid version.');
  if (record.schemaVersion !== 1) return record; // A newer client keeps ownership of its own representation.
  if (
    record.kind !== 'research-photo' ||
    record.id !== researchPhotoId(record.careerId, record.runId, record.slot) ||
    !/^[a-f0-9]{64}$/.test(record.fingerprint || '') ||
    !Number.isFinite(record.capturedAt) ||
    record.capturedAt <= 0
  )
    throw Error('This field photograph is incomplete.');
  validateAlbumPhoto(record.photo);
  return record;
}
// Hash work runs before opening a read/write transaction. Awaiting WebCrypto
// inside an IndexedDB transaction would let it close before the photo is saved.
export async function prepareResearchPhoto(careerId, capture, attachment) {
  if (!capture && !attachment) return null;
  if (!capture || !attachment)
    throw Error('Take and keep the field photograph before recording this step.');
  const photo = clone(validateAlbumPhoto(attachment));
  const record = {
    id: researchPhotoId(careerId, capture.runId, capture.slot),
    kind: 'research-photo',
    schemaVersion: 1,
    careerId,
    runId: capture.runId,
    slot: capture.slot,
    capturedAt: capture.at,
    fingerprint: capture.fingerprint,
    photo
  };
  validateResearchMediaRecord(record);
  if (
    capture.id !== record.id ||
    capture.width !== photo.width ||
    capture.height !== photo.height ||
    (await hash(photo.dataUrl)) !== capture.fingerprint
  )
    throw Error('The photograph and its field evidence do not match. Take it again.');
  return record;
}
export async function verifyResearchMediaRecords(records) {
  if (
    !Array.isArray(records) ||
    records.length > 128 ||
    new Set(records.map((row) => row?.id)).size !== records.length
  )
    throw Error('This field photograph archive is too large or damaged.');
  for (const record of records) {
    validateResearchMediaRecord(record);
    if (record.schemaVersion === 1 && (await hash(record.photo.dataUrl)) !== record.fingerprint)
      throw Error('A field photograph does not match its recorded fingerprint.');
  }
}
export async function validateTransitionMedia(careerId, result, prepared, read) {
  const added = result.mediaRefs || [],
    required = result.requiredMedia || [];
  if (
    prepared &&
    !added.some((ref) => ref.id === prepared.id && ref.fingerprint === prepared.fingerprint)
  )
    throw Error('This field step does not accept that photograph.');
  if (added.length && (!prepared || added.length !== 1))
    throw Error('Take and keep the required photograph before continuing.');
  for (const ref of [...added, ...required]) {
    const record = prepared?.id === ref.id ? prepared : await read(ref.id);
    if (
      !record ||
      record.schemaVersion !== 1 ||
      record.careerId !== careerId ||
      record.runId !== result.state.active.runId ||
      record.fingerprint !== ref.fingerprint
    )
      throw Error(
        'A photograph required by this field record is missing or needs a newer version.'
      );
  }
}
export function validateResearchMediaReferences(careers, records, events = []) {
  const byId = new Map((records || []).map((row) => [row.id, row]));
  function check(careerId, runId, capture) {
    const row = byId.get(capture.id);
    if (!row) throw Error('A field photograph referenced by this study is missing.');
    if (row.schemaVersion !== 1) return;
    if (row.careerId !== careerId || row.runId !== runId || row.fingerprint !== capture.fingerprint)
      throw Error('A field photograph referenced by this study does not match its context.');
  }
  for (const [careerId, career] of Object.entries(careers || {})) {
    if (career?.schemaVersion !== 1) continue;
    for (const capture of Object.values(career.active?.captures || {})) {
      check(careerId, career.active.runId, capture);
    }
  }
  for (const event of events) {
    const metadata = event.metadata,
      capture = metadata?.action?.capture;
    if (
      event.sourceSystem === 'research-careers' &&
      careers?.[metadata?.careerId]?.schemaVersion === 1 &&
      capture?.id?.startsWith(RESEARCH_MEDIA_PREFIX)
    )
      check(metadata.careerId, metadata.runId, capture);
  }
}
