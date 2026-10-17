// Source edits and physical ground revisions have separate identities. An edit
// can change frontage without changing terrain; an older async build must not
// clear that edit's invalidation when it finishes.
export function markStreetSourceChanged(ctx) {
  ctx._streetSourceRevision = (ctx._streetSourceRevision || 0) + 1;
  ctx._streetPavementDirty = true;
}
