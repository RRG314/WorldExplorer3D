import { prepareStreetPavement, compilePavementTile, meshPavementTile } from './street-pavement.js';
import { serializeStreetPavementFingerprint, serializePavementSurfaceFingerprint } from './street-pavement-fingerprint.js';
import { indexPavementPositions } from '../pavement-indexed-mesh.js';
let plan = null, cursor = 0, debug = false, cached={}, surfaces={};
async function fingerprint(value) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'index') {
      // Final batches have one owner. Transfer their storage back after exact
      // render-precision indexing; compilation scratch stays off the UI thread.
      if (!(data.positions instanceof Float32Array)) throw new TypeError('Pavement indexing requires Float32 positions');
      const indexed = indexPavementPositions(data.positions);
      self.postMessage({type:'indexed',...indexed},[indexed.positions.buffer,indexed.indices.buffer]);
    } else if (data.type === 'prepare') {
      debug = data.debug === true; cached=data.cached||{};surfaces=data.surfaces||{};plan = prepareStreetPavement(data.input); cursor = 0;
      // Consume retained cells before misses can evict them from the bounded
      // cache. A sequential scan larger than the cache otherwise misses every
      // cell on every window, despite substantial geographic overlap.
      plan.tiles.sort((a,b)=>Number(!!cached[b.key])-Number(!!cached[a.key]));
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
      const sourceFingerprint=await fingerprint(serializeStreetPavementFingerprint(tile,plan.metersPerWorldUnit));
      if(data.type!=='retry'&&cached[tile.key]===sourceFingerprint){self.postMessage({type:'cached',key:tile.key,fingerprint:sourceFingerprint,completed:cursor,total:plan.tiles.length});return;}
      const started = performance.now();
      const result = compilePavementTile(tile, plan.metersPerWorldUnit);
      const surfaceFingerprint=await fingerprint(serializePavementSurfaceFingerprint(tile,result,plan.metersPerWorldUnit));
      const metadata={key:tile.key,fingerprint:sourceFingerprint,surfaceFingerprint,bounds:tile.bounds,
        segments:tile.segments.map(({road,a,b,wa,wb,offset})=>({a,b,wa,wb,offset,roadIndex:road.auditIndex})),
        inferredFrontages:result.inferredFrontages,ramps:result.ramps,rampCount:result.ramps?.length||0,completed:cursor,total:plan.tiles.length};
      const retained=surfaces[tile.key];
      if(data.type!=='retry'&&retained?.surfaceFingerprint===surfaceFingerprint){
        self.postMessage({type:'cached',...metadata,reuseFingerprint:retained.fingerprint,durationMs:Math.round(performance.now()-started)});
        return;
      }
      const mesh = result.polygons.length ? meshPavementTile(tile, result.polygons, () => 0, { curbHeight: 0.12 / plan.metersPerWorldUnit, ramps:result.ramps,includeTriangles:false }) : { vertices: [], curbVertices: [], triangles: [] };
      mesh.markingVertices=result.markingPolygons?.length ? meshPavementTile(tile,result.markingPolygons,()=>0,{curbHeight:0,cellSize:2}).vertices : [];
      delete mesh.triangles; // Contact reuses the final render buffer; do not clone point objects across threads.
      const transfer=[];
      for(const name of ['vertices','curbVertices','markingVertices']){mesh[name]=new Float64Array(mesh[name]||[]);transfer.push(mesh[name].buffer);}
      // A single acknowledged chunk is in flight. No unbounded mesh message queue.
      self.postMessage({ type: 'tile', ...metadata,
        // Only height-sampling inputs cross the worker boundary. Frontage
        // sections, masks and compiler bounds have already served their owner.
        mesh,
        durationMs: Math.round(performance.now() - started) }, transfer);
    }
  } catch (error) { self.postMessage({ type: 'error', message: String(error?.message || error) }); plan = null; }
};
