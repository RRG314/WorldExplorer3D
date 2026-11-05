import {
  encodeJourney,
  decodeJourney,
  journeyChunkBase64,
  readJourneyChunk,
} from './journey-codec.js';
import { JOURNEY_MAX_BYTES, JOURNEY_CHUNK_BYTES } from './journey-format.js';
export function createJourneyCloudApi({ send, getOwnerUid }) {
  async function request(uid, input) {
    if (!uid || uid !== getOwnerUid())
      throw Object.assign(Error('Your account changed. Your device save is kept.'), {
        code: 'journey-owner-changed',
      });
    const result = await send({ ...input, expectedOwnerUid: uid }, { expectedUserId: uid });
    if (uid !== getOwnerUid() || result.ownerUid !== uid)
      throw Object.assign(Error('Your account changed. Your device save is kept.'), {
        code: 'journey-owner-changed',
      });
    return result;
  }
  const head = async (uid) => {
    const result = await request(uid, { action: 'head' });
    if (result.schemaVersion !== 1)
      throw Error('This account save needs a newer World Explorer. Your device save is kept.');
    return result;
  };
  return Object.freeze({
    head,
    async upload(
      uid,
      envelope,
      { expectedRevision, clientId, priorUpload, onPrepared = () => {} }
    ) {
      const encoded = await encodeJourney(envelope);
      const uploadId =
        priorUpload?.digest === encoded.digest ? priorUpload.uploadId : crypto.randomUUID();
      if (priorUpload && priorUpload.uploadId !== uploadId)
        await request(uid, {
          action: 'abandon',
          uploadId: priorUpload.uploadId,
          clientId,
          expectedRevision,
        });
      const command = {
        action: 'begin',
        uploadId,
        clientId,
        expectedRevision,
        totalBytes: encoded.totalBytes,
        digest: encoded.digest,
        encoding: encoded.encoding,
      };
      await onPrepared({ ...command, action: undefined });
      const started = await request(uid, command);
      if (started.committed) return started.current;
      for (let index = 0; index < encoded.chunkCount; index++)
        await request(uid, {
          action: 'chunk',
          uploadId,
          index,
          data: journeyChunkBase64(encoded.bytes, index),
        });
      try {
        return (await request(uid, { action: 'commit', uploadId })).current;
      } catch (error) {
        const current = await head(uid).catch(() => null);
        if (current?.current?.snapshotId === uploadId && current.current.digest === encoded.digest)
          return current.current;
        throw error;
      }
    },
    async download(uid, manifest) {
      if (
        !manifest ||
        !Number.isSafeInteger(manifest.totalBytes) ||
        manifest.totalBytes < 2 ||
        manifest.totalBytes > JOURNEY_MAX_BYTES ||
        manifest.chunkCount !== Math.ceil(manifest.totalBytes / JOURNEY_CHUNK_BYTES)
      )
        throw Error('This account save has an unsupported size. Your device save is kept.');
      const bytes = new Uint8Array(manifest.totalBytes);
      for (let index = 0; index < manifest.chunkCount; index++) {
        const response = await request(uid, {
          action: 'download',
          snapshotId: manifest.snapshotId,
          index,
        });
        if (response.snapshotId !== manifest.snapshotId || response.index !== index)
          throw Error('Your account save changed during download. Try again.');
        const part = readJourneyChunk(response.data),
          expected = Math.min(
            JOURNEY_CHUNK_BYTES,
            manifest.totalBytes - index * JOURNEY_CHUNK_BYTES
          );
        if (part.byteLength !== expected)
          throw Error('Your account save did not arrive completely. Try again.');
        bytes.set(part, index * JOURNEY_CHUNK_BYTES);
      }
      return decodeJourney(bytes, manifest, uid);
    },
  });
}
