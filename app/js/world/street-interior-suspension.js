export function cancelUnfinishedStreetDetail(ctx) {
  if (!ctx._cancelStreetPavementBuild) return false;
  const cancel = ctx._cancelStreetPavementBuild;
  ctx._cancelStreetPavementBuild = null;
  cancel();
  // Retiring speculative work does not invalidate the accepted publication.
  // Real source/ground invalidation stays pending until a replacement commits.
  // With no accepted surface, cancellation must still allow the first retry.
  if (!ctx.streetPavement) ctx._streetPavementDirty = true;
  return true;
}

export function suspendEarthStreetPreparation(ctx) {
  // Accepted pavement and its coverage atlas remain owned by this Earth world.
  // Only unfinished preparation is retired while an interior owns the view.
  const overview = ctx.streetOverview;
  if (overview && !['suspended', 'complete', 'disposed'].includes(overview.stats?.status)) {
    void overview.suspendForDetail();
  }
  cancelUnfinishedStreetDetail(ctx);
}

export function suspendStreetPreparationForInterior(ctx) {
  if (!ctx.activeInterior && !ctx.activeShipInterior) return false;
  suspendEarthStreetPreparation(ctx);
  return true;
}
