import { prepareStreetPavement, compilePavementTile, meshPavementTile } from './street-pavement.js';
import { serializeStreetPavementFingerprint } from './street-pavement-fingerprint.js';
let plan = null, cursor = 0, debug = false, cached={};
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'prepare') {
      debug = data.debug === true; cached=data.cached||{};plan = prepareStreetPavement(data.input); cursor = 0;
      self.postMessage({ type: 'prepared', tiles: plan.tiles.length });
    } else if ((data.type === 'next'||data.type==='retry') && plan) {
      const tile = data.type==='retry'?plan.tiles[cursor-1]:plan.tiles[cursor++];
      if (!tile) { self.postMessage({ type: 'complete' }); plan = null; return; }
      // Retain only the current cell in the opt-in diagnostic textarea. This
      // must precede clipping so a timed-out polygon is reproducible as well.
      if(debug) {
        const road=r=>({auditIndex:r.auditIndex,type:r.type,tags:r.tags,transportRecord:{sourceTags:r.transportRecord?.sourceTags}});
        const slim={...tile,segments:tile.segments.map(s=>({...s,road:road(s.road)})),joins:tile.joins.map(s=>({...s,road:road(s.road)}))};
        self.postMessage({type:'trace',tile:slim});
      }
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serializeStreetPavementFingerprint(tile,plan.metersPerWorldUnit)));
      const fingerprint=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
      if(data.type!=='retry'&&cached[tile.key]===fingerprint){self.postMessage({type:'cached',key:tile.key,fingerprint,completed:cursor,total:plan.tiles.length});return;}
      const started = performance.now();
      const result = compilePavementTile(tile, plan.metersPerWorldUnit);
      const mesh = result.polygons.length ? meshPavementTile(tile, result.polygons, () => 0, { curbHeight: 0.12 / plan.metersPerWorldUnit, ramps:result.ramps,includeTriangles:false }) : { vertices: [], curbVertices: [], triangles: [] };
      mesh.markingVertices=result.markingPolygons?.length ? meshPavementTile(tile,result.markingPolygons,()=>0,{curbHeight:0,cellSize:2}).vertices : [];
      delete mesh.triangles; // Contact reuses the final render buffer; do not clone point objects across threads.
      // A single acknowledged chunk is in flight. No unbounded mesh message queue.
      self.postMessage({ type: 'tile', key: tile.key, fingerprint, bounds: tile.bounds,
        segments: tile.segments.map(s => ({ ...s, road: undefined, roadIndex: s.road.auditIndex })),
        inferredFrontages: result.inferredFrontages, ramps:result.ramps, rampCount:result.ramps?.length || 0, mesh, completed: cursor, total: plan.tiles.length,
        durationMs: Math.round(performance.now() - started) });
    }
  } catch (error) { self.postMessage({ type: 'error', message: String(error?.message || error) }); plan = null; }
};
