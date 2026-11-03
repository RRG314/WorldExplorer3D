// The existing album's shared definition; it retains its original public API.
export const THREE_VIEWS = Object.freeze({
  id: 'three-views',
  albumId: 'album:local-explorer:three-views:v1',
  receiptId: 'event:campaign-completed:three-views:v1',
  maxPhotoBytes: 384 * 1024,
  kinds: Object.freeze(['context', 'detail', 'setting']),
});
