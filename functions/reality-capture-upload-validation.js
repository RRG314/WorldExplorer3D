'use strict';

const sharp = require('sharp');
const { createHash } = require('node:crypto');
const { CAPTURE_LIMITS, validateUploadedPhotoSet } = require('./reality-capture-authority');

// Storage metadata is supplied by the client. Decode the actual pinned object,
// not the claimed dimensions, before admitting expensive reconstruction work.
async function validateCaptureObjects(bucket, capture, files) {
  const limits = CAPTURE_LIMITS[capture.captureKind];
  if (!limits || files.length > limits.maxPhotos) throw Error('too_many_photos');
  const prefix = `reality-captures/${capture.ownerUid}/${capture.captureId}/originals/`;
  const manifest = [];
  let total = 0;
  for (const file of files) {
    if (!file.name.startsWith(prefix) || !/^[a-f0-9]{32}\.(jpg|webp)$/.test(file.name.slice(prefix.length))) throw Error('invalid_photo_name');
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    total += size;
    if (!Number.isSafeInteger(size) || size < 1 || size > CAPTURE_LIMITS.maxFileBytes || total > limits.maxTotalBytes) throw Error('photo_size_out_of_range');
    if (!/^\d+$/.test(String(metadata.generation))) throw Error('photo_generation_required');
    const pinned = bucket.file(file.name, { generation: metadata.generation });
    const [bytes] = await pinned.download();
    if (bytes.length !== size) throw Error('photo_size_changed');
    const decoder = sharp(bytes, { limitInputPixels: CAPTURE_LIMITS.maxPixels, failOn: 'warning', animated: false });
    const image = await decoder.metadata();
    const type = image.format === 'jpeg' ? 'image/jpeg' : image.format === 'webp' ? 'image/webp' : '';
    if (!type || type !== metadata.contentType || (image.pages || 1) !== 1) throw Error('unsupported_photo_type');
    // metadata() alone accepts truncated JPEGs; force a complete decode.
    await decoder.stats();
    const sector = Number(metadata.metadata?.sector);
    manifest.push({ name: file.name, generation: String(metadata.generation), size, contentType: type,
      width: image.width, height: image.height, sha256: createHash('sha256').update(bytes).digest('hex'),
      sector: Number.isInteger(sector) && sector >= 0 && sector < 8 ? sector : -1 });
  }
  return { manifest, summary: validateUploadedPhotoSet(capture, manifest) };
}

module.exports = { validateCaptureObjects };
