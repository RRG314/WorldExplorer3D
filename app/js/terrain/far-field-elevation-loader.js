export const FAR_TERRAIN_REQUEST_CONCURRENCY = 12;

export async function loadFarTerrainElevationTiles(options = {}) {
  const tiles = Array.isArray(options.tiles) ? options.tiles : [];
  const loadTile = options.loadTile;
  const isActive = typeof options.isActive === 'function' ? options.isActive : () => true;
  const concurrency = Math.max(
    1,
    Math.min(32, Math.floor(Number(options.concurrency) || FAR_TERRAIN_REQUEST_CONCURRENCY))
  );
  if (typeof loadTile !== 'function') throw new TypeError('Far terrain elevation loader requires loadTile().');

  const ready = Array(tiles.length).fill(false);
  let cursor = 0;
  let started = 0;
  let completed = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let cancelled = false;

  const worker = async () => {
    while (cursor < tiles.length) {
      if (!isActive()) {
        cancelled = true;
        return;
      }
      const index = cursor;
      cursor += 1;
      started += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        ready[index] = await loadTile(tiles[index], index) === true;
      } catch {
        ready[index] = false;
      } finally {
        inFlight -= 1;
        completed += 1;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tiles.length) }, () => worker())
  );
  if (!isActive() && cursor < tiles.length) cancelled = true;

  return Object.freeze({
    ready: Object.freeze(ready),
    requested: tiles.length,
    started,
    completed,
    unstarted: tiles.length - started,
    maxInFlight,
    concurrency,
    cancelled
  });
}

export async function loadFarTerrainElevationWithParentFallback(options = {}) {
  const tiles = Array.isArray(options.tiles) ? options.tiles : [];
  const parentTile = options.parentTile;
  if (typeof parentTile !== 'function') {
    throw new TypeError('Far terrain parent fallback requires parentTile().');
  }
  const primary = await loadFarTerrainElevationTiles(options);
  const missingSourceTiles = tiles.filter((_, index) => !primary.ready[index]);
  const fallbackByKey = new Map();
  for (const tile of missingSourceTiles) {
    const parent = parentTile(tile);
    const key = String(parent?.key || `${parent?.z}/${parent?.tx}/${parent?.ty}`);
    fallbackByKey.set(key, { ...parent, key });
  }
  const fallbackTiles = [...fallbackByKey.values()];
  const fallback = fallbackTiles.length ? await loadFarTerrainElevationTiles({
    ...options,
    tiles: fallbackTiles
  }) : null;
  return Object.freeze({
    primary,
    fallback,
    missingSourceTiles: Object.freeze(missingSourceTiles),
    fallbackTiles: Object.freeze(fallbackTiles),
    ready: !fallback || fallback.ready.every(Boolean)
  });
}
