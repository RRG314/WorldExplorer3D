export function mappedWaterBedMetersAt(
  longitude,
  latitude,
  terrainMeters,
  waterAreas = [],
  pointInMappedWaterArea = null,
  bedDepthMeters = 12
) {
  if (!Number.isFinite(terrainMeters) || typeof pointInMappedWaterArea !== 'function') {
    return terrainMeters;
  }
  let resolvedMeters = terrainMeters;
  // The fixed location LOD uses a 320 m grid. A shallow sub-meter cut can
  // still let one coarse terrain triangle cross the water plane between its
  // vertices, especially with a 12 km camera depth range. Keep the regional
  // bed safely below the mapped surface; the detailed terrain pipeline owns
  // the fine shoreline feather close to the selected city.
  for (const area of waterAreas || []) {
    const surfaceMeters = Number(area?.surfaceMeters);
    if (!Number.isFinite(surfaceMeters)) continue;
    if (!pointInMappedWaterArea(longitude, latitude, area)) continue;
    const coastalOwner = area?.kind === 'ocean' || area?._surfaceOwnerKind === 'ocean';
    const depth = coastalOwner
      ? Math.max(30, Number(bedDepthMeters) || 12)
      : Math.max(2, Number(bedDepthMeters) || 12);
    resolvedMeters = Math.min(resolvedMeters, surfaceMeters - depth);
  }
  return resolvedMeters;
}


// Broad phase only: exact polygon/hole membership and water ownership still
// decide the bed. Large/unbounded polygons remain candidates for every query.
export function createMappedWaterBedSampler(areas = [], contains = null) {
  const buckets = new Map(), broad = [], scale = 64;
  for (const area of areas) {
    const b = area?.bounds;
    if (!b || ![b.minLon,b.maxLon,b.minLat,b.maxLat].every(Number.isFinite)) { broad.push(area); continue; }
    const x0=Math.floor(b.minLon*scale),x1=Math.floor(b.maxLon*scale),y0=Math.floor(b.minLat*scale),y1=Math.floor(b.maxLat*scale);
    const count=(x1-x0+1)*(y1-y0+1);
    if (count>64 || count<=0 || ![x0,x1,y0,y1].every(Number.isSafeInteger)) { broad.push(area); continue; }
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++) {
      const key=`${x}:${y}`;let list=buckets.get(key);
      if(!list){list=[];buckets.set(key,list);}list.push(area);
    }
  }
  return (lon,lat,terrainMeters,depth=12) => {
    const local=buckets.get(`${Math.floor(lon*scale)}:${Math.floor(lat*scale)}`);
    const regional=mappedWaterBedMetersAt(lon,lat,terrainMeters,broad,contains,depth);
    return local ? mappedWaterBedMetersAt(lon,lat,regional,local,contains,depth) : regional;
  };
}
