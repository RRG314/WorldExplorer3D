import { photoDataFingerprint } from './research-media.js';
import { validateAlbumPhoto } from './three-views.js';
// WebCrypto runs before opening a write transaction. The transaction then
// checks the exact bytes again, including a same-revision backup replacement.
export async function prepareDocumentaryMedia(base, album) {
  const story = base?.story;
  if (!story || story.schemaVersion !== 1 || !story.source || base.mediaDeleted) return null;
  const photographs = story.source.photographs;
  if (!Array.isArray(photographs) || photographs.length !== 3 || album?.photos?.length !== 3)
    throw Error('Restore the three original story photographs.');
  const checked = [];
  for (const ref of photographs) {
    const photo = album.photos.find((p) => p.id === ref.id);
    validateAlbumPhoto(photo);
    if (
      photo.width !== ref.width ||
      photo.height !== ref.height ||
      (await photoDataFingerprint(photo.dataUrl)) !== ref.fingerprint
    )
      throw Error('A story photograph differs from its original saved image.');
    checked.push({ id: photo.id, dataUrl: photo.dataUrl });
  }
  return checked;
}
export function assertDocumentaryMediaCurrent(checked, album) {
  if (
    !checked ||
    album?.photos?.length !== 3 ||
    checked.some((ref) => album.photos.find((p) => p.id === ref.id)?.dataUrl !== ref.dataUrl)
  )
    throw Error('The album changed while preparing this story. Reopen it and try again.');
}
