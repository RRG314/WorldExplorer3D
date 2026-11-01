export function createWorldLoadCoordinator(options = {}) {
  const { appCtx, getWorldLoadSignature, loadWorld } = options;
  const cancelActive = typeof options.cancelActive === 'function' ? options.cancelActive : () => false;
  if (!appCtx || typeof getWorldLoadSignature !== 'function' || typeof loadWorld !== 'function') {
    throw new TypeError('World load coordinator requires appCtx, getWorldLoadSignature(), and loadWorld().');
  }
  let activeWorldLoad = null;

  async function coordinatedLoad(retryPass = 0) {
    if (options.admitRequest?.() === false) {
      return {aborted: true, reason: 'invalid_location_selection'};
    }
    const signature = getWorldLoadSignature();
    if (retryPass > 0) {
      await options.prepareLoad?.();
      if(signature!==getWorldLoadSignature())return {aborted:true,reason:'superseded-before-preparation'};
      return loadWorld(retryPass);
    }
    if (activeWorldLoad) {
      if (activeWorldLoad.signature === signature) return activeWorldLoad.promise;
      if (activeWorldLoad.supersededBySignature !== signature) {
        activeWorldLoad.supersededBySignature = signature;
        cancelActive('new-location-selection');
        appCtx._worldLoadSequence = Number(appCtx._worldLoadSequence || 0) + 1;
        activeWorldLoad.terrainDrain = Promise.resolve(
          appCtx.resetFarTerrainClipmap?.()
        ).catch(() => undefined);
      }
      return Promise.all([
        activeWorldLoad.promise.catch(() => undefined),
        activeWorldLoad.terrainDrain || Promise.resolve()
      ])
        .then(() => coordinatedLoad(0));
    }

    const prepared = typeof options.prepareLoad === 'function' ? (async () => {
      await options.prepareLoad();
      // An asynchronous presentation release may outlive another selection.
      // Let the queued request load its own destination without a duplicate reset.
      if (signature !== getWorldLoadSignature()) return {aborted:true,reason:'superseded-before-preparation'};
      return loadWorld(0);
    })() : Promise.resolve(loadWorld(0));
    const promise = prepared.finally(() => {
      if (activeWorldLoad?.promise === promise) activeWorldLoad = null;
    });
    activeWorldLoad = { signature, promise, supersededBySignature: '', terrainDrain: null };
    return promise;
  }

  return Object.freeze({ loadWorld: coordinatedLoad });
}

export function createWorldLoadCancellationSlot() {
  let activeCancellation = null;
  return Object.freeze({
    cancel(reason = 'superseded') {
      return typeof activeCancellation === 'function' ? activeCancellation(reason) : false;
    },
    register(cancellation) {
      if (typeof cancellation !== 'function') throw new TypeError('World load cancellation must be a function.');
      activeCancellation = cancellation;
      return () => {
        if (activeCancellation === cancellation) activeCancellation = null;
      };
    }
  });
}
