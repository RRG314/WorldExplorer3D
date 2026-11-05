import {
  JOURNEY_MAX_BYTES,
  JOURNEY_CHUNK_BYTES,
  validateJourneyEnvelope,
} from './journey-format.js';
export async function journeyDigest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}
export async function encodeJourney(envelope) {
  validateJourneyEnvelope(envelope, envelope.ownerUid);
  const raw = new TextEncoder().encode(JSON.stringify(envelope));
  if (raw.byteLength > JOURNEY_MAX_BYTES)
    throw Error(
      'This journey is too large for account sync. Your complete device save is kept. Export a backup before changing devices.'
    );
  const compressed =
    typeof CompressionStream === 'function'
      ? new Uint8Array(
          await new Response(
            new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))
          ).arrayBuffer()
        )
      : raw;
  const encoding = compressed.byteLength < raw.byteLength ? 'gzip' : 'json',
    bytes = encoding === 'gzip' ? compressed : raw;
  return {
    bytes,
    encoding,
    digest: await journeyDigest(bytes),
    totalBytes: bytes.byteLength,
    chunkCount: Math.ceil(bytes.byteLength / JOURNEY_CHUNK_BYTES),
  };
}
export function journeyChunkBase64(bytes, index) {
  const chunk = bytes.subarray(index * JOURNEY_CHUNK_BYTES, (index + 1) * JOURNEY_CHUNK_BYTES);
  let binary = '';
  for (let offset = 0; offset < chunk.length; offset += 0x8000)
    binary += String.fromCharCode(...chunk.subarray(offset, offset + 0x8000));
  return btoa(binary);
}
export function readJourneyChunk(data) {
  if (typeof data !== 'string' || data.length > Math.ceil(JOURNEY_CHUNK_BYTES / 3) * 4)
    throw Error('Your account save contains an invalid data block.');
  return Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
}
export async function decodeJourney(bytes, manifest, ownerUid) {
  if (bytes.byteLength !== manifest.totalBytes || (await journeyDigest(bytes)) !== manifest.digest)
    throw Error(
      'Your account save did not arrive completely. Your current device save is kept. Try again.'
    );
  let raw = bytes;
  if (manifest.encoding === 'gzip') {
    if (typeof DecompressionStream !== 'function')
      throw Error(
        'This browser cannot read your compressed account save. Use a current browser; your device save is kept.'
      );
    const reader = new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'))
        .getReader(),
      parts = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > JOURNEY_MAX_BYTES) {
          await reader.cancel();
          throw Error('Your account save exceeds this build’s supported size.');
        }
        parts.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    raw = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      raw.set(part, offset);
      offset += part.byteLength;
    }
  } else if (manifest.encoding !== 'json')
    throw Error('This account save needs a newer World Explorer.');
  if (raw.byteLength > JOURNEY_MAX_BYTES)
    throw Error('Your account save exceeds this build’s supported size.');
  return validateJourneyEnvelope(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)),
    ownerUid
  );
}
