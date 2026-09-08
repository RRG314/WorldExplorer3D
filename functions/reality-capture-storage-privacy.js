'use strict';

// Firebase SDK uploads may carry a permanent bearer download token even when
// Storage rules deny reads. Remove that capability without rewriting the media.
async function sealCapturePhoto(file, metadata) {
  if (!metadata.metadata?.firebaseStorageDownloadTokens) return false;
  if (!/^\d+$/.test(String(metadata.generation)) || !/^\d+$/.test(String(metadata.metageneration))) {
    throw Error('private_photo_version_required');
  }
  await file.setMetadata({metadata:{firebaseStorageDownloadTokens:null},cacheControl:'private, no-store, max-age=0'}, {
    ifGenerationMatch:metadata.generation, ifMetagenerationMatch:metadata.metageneration
  });
  const [current] = await file.getMetadata();
  if (current.metadata?.firebaseStorageDownloadTokens || String(current.generation)!==String(metadata.generation)) {
    throw Error('private_photo_sealing_failed');
  }
  return true;
}

module.exports={sealCapturePhoto};
