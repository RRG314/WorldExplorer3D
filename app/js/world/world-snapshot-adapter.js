import {
  createWorldSnapshot,
  createWorldSnapshotStore,
  WORLD_SNAPSHOT_LAYERS
} from '../earth-core/world-snapshot.js?v=2';
import { worldLayerProductCounts } from './compiler/world-layer-products.js?v=3';

function snapshotLayerFromProduct(product, request, name) {
  if (
    product?.type !== 'WorldLayerProduct' ||
    !Object.isFrozen(product) ||
    product.requestId !== request.id ||
    product.layer !== name
  ) {
    throw new TypeError(`WorldSnapshot requires a matching immutable ${name} layer product.`);
  }
  return {
    authority: product.authority,
    completeness: product.completeness,
    source: product.source,
    coverage: product.coverage,
    records: product.record ? [product.record] : []
  };
}

export function createWorldPublicationSnapshot(options = {}) {
  const { request, layerProducts, createdAt = 0 } = options;
  if (!layerProducts || !Object.isFrozen(layerProducts)) {
    throw new TypeError('WorldSnapshot requires immutable compiler layer products.');
  }
  return createWorldSnapshot({
    request,
    counts: worldLayerProductCounts(layerProducts),
    createdAt,
    layers: Object.fromEntries(
      WORLD_SNAPSHOT_LAYERS.map((name) => [
        name,
        snapshotLayerFromProduct(layerProducts[name], request, name)
      ])
    )
  });
}

export function publishWorldPublicationSnapshot(appCtx, options = {}) {
  if (!appCtx || !options.request) throw new TypeError('World publication requires application context and request.');
  if (!appCtx.worldSnapshotStore) {
    appCtx.worldSnapshotStore = createWorldSnapshotStore();
  }
  const snapshot = createWorldPublicationSnapshot(options);
  const publication = appCtx.worldSnapshotStore.publish(snapshot, {
    expectedRequestId: options.request.id
  });
  if (!publication.published) {
    throw new Error(`WorldSnapshot publication rejected: ${publication.reason || 'unknown'}`);
  }
  appCtx.worldPublication = publication.current;
  return publication.current;
}
