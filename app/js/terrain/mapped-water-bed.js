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


// Broad phase only: exact polygon/hole membership and mutable water levels
// remain authoritative. A hierarchy also prunes large coastal polygons; the
// former grid put every wide polygon in every query's fallback list.
export function createMappedWaterBedSampler(areas = [], contains = null) {
  const bounded=[],unbounded=[];
  for(const area of areas){
    const b=area?.bounds;
    if(!b || ![b.minLon,b.maxLon,b.minLat,b.maxLat].every(Number.isFinite) || b.minLon>b.maxLon || b.minLat>b.maxLat)unbounded.push(area);
    else bounded.push(area);
  }
  function build(items){
    if(!items.length)return null;
    const node={minLon:Infinity,maxLon:-Infinity,minLat:Infinity,maxLat:-Infinity};
    for(const area of items){const b=area.bounds;node.minLon=Math.min(node.minLon,b.minLon);node.maxLon=Math.max(node.maxLon,b.maxLon);node.minLat=Math.min(node.minLat,b.minLat);node.maxLat=Math.max(node.maxLat,b.maxLat);}
    if(items.length<=8){node.areas=items;return node;}
    const axis=node.maxLon-node.minLon>=node.maxLat-node.minLat?'Lon':'Lat';
    items.sort((a,b)=>(a.bounds['min'+axis]+a.bounds['max'+axis])-(b.bounds['min'+axis]+b.bounds['max'+axis]));
    const middle=Math.floor(items.length/2);node.left=build(items.slice(0,middle));node.right=build(items.slice(middle));return node;
  }
  const root=build(bounded);
  function visit(node,lon,lat,meters,depth){
    if(!node || lon<node.minLon || lon>node.maxLon || lat<node.minLat || lat>node.maxLat)return meters;
    if(node.areas){
      for(const area of node.areas){
        const b=area.bounds;
        if(lon<b.minLon || lon>b.maxLon || lat<b.minLat || lat>b.maxLat)continue;
        const surface=Number(area.surfaceMeters);
        if(!Number.isFinite(surface)||!contains(lon,lat,area))continue;
        const coastal=area.kind==='ocean'||area._surfaceOwnerKind==='ocean';
        meters=Math.min(meters,surface-Math.max(coastal?30:2,Number(depth)||12));
      }
      return meters;
    }
    return visit(node.right,lon,lat,visit(node.left,lon,lat,meters,depth),depth);
  }
  return (lon,lat,meters,depth=12)=>{
    if(!Number.isFinite(meters)||typeof contains!=='function')return meters;
    const regional=mappedWaterBedMetersAt(lon,lat,meters,unbounded,contains,depth);
    return visit(root,lon,lat,regional,depth);
  };
}
