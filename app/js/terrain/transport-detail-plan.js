// Regions are publication units; 128-unit compiler cells keep their existing
// ownership. A region is ready only after both its render and contact data exist.
export const TRANSPORT_REGION_SIZE = 1024;
export const INITIAL_TRANSPORT_RADIUS = 2048;
// The starting neighbourhood is compiled with the structure owner. Additional
// at-grade regions have a separate moving residency budget until that owner is
// migrated too. A visual road overview remains available outside this window.
export const TRANSPORT_DETAIL_RADIUS = 1024;
export const TRANSPORT_RETENTION_RADIUS = 2048;
export const MAX_MOVING_TRANSPORT_REGIONS = 16;
export function transportRegionDistanceSquared(bounds, focus) {
  const dx=Math.max(bounds.minX-focus.x,0,focus.x-bounds.maxX);
  const dz=Math.max(bounds.minZ-focus.z,0,focus.z-bounds.maxZ);
  return dx*dx+dz*dz;
}
export function transportRegionInWindow(bounds, focus, radius) {
  return bounds.maxX>focus.x-radius&&bounds.minX<focus.x+radius&&
    bounds.maxZ>focus.z-radius&&bounds.minZ<focus.z+radius;
}
export function actorRequestsRoadDetail(point,terrainY) {
  if(point?.source==='boat')return false;
  // Begin landing preparation well before the existing 128-unit contact gate.
  if(['plane','drone'].includes(point?.source)&&Number.isFinite(point.y)&&Number.isFinite(terrainY)&&point.y-terrainY>384)return false;
  return true;
}
export function transportRegionKey(x,z) {
  return `${Math.floor(x/TRANSPORT_REGION_SIZE)}:${Math.floor(z/TRANSPORT_REGION_SIZE)}`;
}
export function transportRegionBounds(key) {
  const [x,z]=key.split(':').map(Number);
  return {minX:x*TRANSPORT_REGION_SIZE,maxX:(x+1)*TRANSPORT_REGION_SIZE,minZ:z*TRANSPORT_REGION_SIZE,maxZ:(z+1)*TRANSPORT_REGION_SIZE};
}
export function planTransportRegions(tiles,focus={x:0,z:0},radius=INITIAL_TRANSPORT_RADIUS) {
  const regions=new Map();
  for(const tile of tiles){
    const key=transportRegionKey((tile.bounds.minX+tile.bounds.maxX)/2,(tile.bounds.minZ+tile.bounds.maxZ)/2);
    if(!regions.has(key))regions.set(key,{key,bounds:transportRegionBounds(key),tiles:[]});
    regions.get(key).tiles.push(tile);
  }
  const initial=[],pending=[];
  for(const region of regions.values()){
    const b=region.bounds;
    const near=b.maxX>focus.x-radius&&b.minX<focus.x+radius&&b.maxZ>focus.z-radius&&b.minZ<focus.z+radius;
    (near?initial:pending).push(region);
  }
  return {initial,pending};
}
export function nearestTransportRegion(regions,focus) {
  let selected=-1,best=Infinity;
  for(let i=0;i<regions.length;i++){
    const b=regions[i].bounds;
    const dx=Math.max(b.minX-focus.x,0,focus.x-b.maxX),dz=Math.max(b.minZ-focus.z,0,focus.z-b.maxZ);
    const distance=dx*dx+dz*dz;
    if(distance<best){best=distance;selected=i;}
  }
  return selected;
}

export function actorNeedsRoadDetail(point,terrainY) {
  if(point?.source==='boat')return false;
  if(['plane','drone'].includes(point?.source)&&Number.isFinite(point.y)&&Number.isFinite(terrainY)&&point.y-terrainY>128)return false;
  return true;
}
