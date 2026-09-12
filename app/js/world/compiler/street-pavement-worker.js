import { prepareStreetPavement, compilePavementTile, meshPavementTile } from './street-pavement.js';
let plan = null, cursor = 0, debug = false;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'prepare') {
      debug = data.debug === true; plan = prepareStreetPavement(data.input); cursor = 0;
      self.postMessage({ type: 'prepared', tiles: plan.tiles.length });
    } else if (data.type === 'next' && plan) {
      const tile = plan.tiles[cursor++];
      if (!tile) { self.postMessage({ type: 'complete' }); plan = null; return; }
      if (debug) {
        const road = r => ({type:r.type,transportRecord:{sourceTags:r.transportRecord?.sourceTags}});
        const slim={...tile,segments:tile.segments.map(s=>({...s,road:road(s.road)})),joins:tile.joins.map(s=>({...s,road:road(s.road)}))};
        self.postMessage({type:'trace',tile:slim});
      }
      const started = performance.now();
      const result = compilePavementTile(tile, plan.metersPerWorldUnit);
      const mesh = result.polygons.length ? meshPavementTile(tile, result.polygons, () => 0, { curbHeight: 0.12 / plan.metersPerWorldUnit }) : { vertices: [], curbVertices: [], triangles: [] };
      // A single acknowledged chunk is in flight. No unbounded mesh message queue.
      self.postMessage({ type: 'tile', key: tile.key, bounds: tile.bounds,
        segments: tile.segments.map(s => ({ ...s, road: undefined, roadIndex: s.road.auditIndex })),
        inferredFrontages: result.inferredFrontages, mesh, completed: cursor, total: plan.tiles.length,
        durationMs: Math.round(performance.now() - started) });
    }
  } catch (error) { self.postMessage({ type: 'error', message: String(error?.message || error) }); plan = null; }
};
