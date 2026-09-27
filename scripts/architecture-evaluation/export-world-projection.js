// Evaluation-only projection of EXISTING published authorities. Never imported by the game.
// It is a bounded interchange proof, not a mutable world store or another compiler.
const number = value => Number.isFinite(value) ? value : null;
const point = p => ({ x: number(p.x), z: number(p.z) });
const intersects = (b, radius) => b && b.minX <= radius && b.maxX >= -radius && b.minZ <= radius && b.maxZ >= -radius;
const plain = value => {
  if (value === null || ['string','boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw Error('Nonfinite schema value');return value; }
  if (Array.isArray(value)) return value.map(plain);
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('Nonportable object in schema');
  return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v]) => [k,plain(v)]));
};

export function projectPublishedLocation(ctx, radius = 180) {
  const groups = new Map();
  for (const b of ctx.buildings || []) {
    if (!b.sourceBuildingId || !b.buildingProvenance || !intersects(b,radius)) continue;
    const id = String(b.sourceBuildingId);
    if (!groups.has(id)) groups.set(id, { id, provenance: plain(b.buildingProvenance), components: [] });
    groups.get(id).components.push({ footprint: (b.pts||[]).map(point), minY: number(b.minY), maxY: number(b.maxY),
      bodyHeightMeters: number(b.bodyHeightMeters), role: String(b.buildingPartKind || ''), roofShape: String(b.roofShape || '') });
  }
  const ids = new Set(groups.keys());
  const roads = (ctx.roads||[]).filter(r=>r.sourceFeatureId && intersects(r.bounds,radius)).map(r=>({
    id: String(r.sourceFeatureId), points: r.pts.map(point), width: number(r.width),
    sourceNodeIds: (r.sourceNodeIds||[]).map(String), source: plain(r.transportRecord),
    surface: r.transportSurfaceModel ? {
      schemaVersion: r.transportSurfaceModel.schemaVersion ?? 1,
      distances: Array.from(r.transportSurfaceModel.distances), centerHeights: Array.from(r.transportSurfaceModel.centerHeights),
      leftHeights: Array.from(r.transportSurfaceModel.leftHeights), rightHeights: Array.from(r.transportSurfaceModel.rightHeights)
    } : null
  }));
  const entrances = (ctx.buildingEntranceCatalog?.entrances||[]).filter(e=>ids.has(String(e.buildingSourceId))).map(plain);
  const water = (ctx.waterAreas||[]).filter(w=>w.registryId && (intersects(w.bounds,radius)||(w.pts||[]).some(p=>Math.abs(p.x)<=radius&&Math.abs(p.z)<=radius))).map(w=>({
    id: String(w.registryId), points: (w.pts||[]).map(point), provenance: plain(w.registryProvenance||{}), datum: plain(w.datum||{})
  }));
  const pois = (ctx.pois||[]).filter(p=>p.sourceFeatureId&&Math.abs(p.x)<=radius&&Math.abs(p.z)<=radius).map(p=>({
    id:String(p.sourceFeatureId),position:point(p),name:String(p.name||''),kind:String(p.type||''),
    source:{provider:String(p.provider||''),license:String(p.license||''),attribution:String(p.attribution||'')}
  }));
  const gridSize = 25, heights = [];
  for(let z=0;z<gridSize;z++)for(let x=0;x<gridSize;x++) {
    heights.push(number(ctx.GroundHeight.terrainY(-radius + 2*radius*x/(gridSize-1),-radius+2*radius*z/(gridSize-1))));
  }
  return plain({
    type:'WorldExplorerPortableProjection',schemaVersion:1,experimental:true,
    publicationId:String(ctx.worldPublication?.id||''),requestId:String(ctx.worldPublication?.requestId||''),
    frame:{origin:{lat:number(ctx.LOC.lat),lon:number(ctx.LOC.lon)},axes:{x:'east',y:'up',z:'south'},metersPerWorldUnit:number(ctx.METERS_PER_WORLD_UNIT),scaleWorldUnitsPerDegree:number(ctx.SCALE)},
    coverage:{radiusWorld:radius,kind:'bounded existing-publication projection',complete:false},
    evidence:{transportPhaseDurationsMs:plain(ctx.transportSurfacePublication?.phaseDurationsMs||{})},
    terrain:{authority:'existing GroundHeight.terrainY',representation:'sampled accepted-ground query, not original terrain resolution',
      tileIds:[...(ctx.terrainTileCache?.keys()||[])].map(String),gridSize,bounds:{minX:-radius,maxX:radius,minZ:-radius,maxZ:radius},heights},
    buildings:[...groups.values()],roads,entrances,water,pois,
    limitations:['Terrain is a coarse query projection; preserve source tiles for full-fidelity ports.','Only published buildings with provenance are included.','Entrances retain mapped/inferred status.','Water can legitimately be empty inside this coverage.','This proof does not replace WorldSnapshot, collision, provider normalization or live collections.']
  });
}
