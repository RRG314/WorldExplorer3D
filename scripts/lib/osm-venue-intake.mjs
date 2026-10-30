// Offline adaptation of a hash-pinned finite OSM response. Account metadata
// never enters the independently reusable venue source.
export function osmVenueIntake(raw,source){
 const format=source.format||'overpass-geom-json-v1';
 if(format==='overpass-geom-json-v1'){
  if(!raw.osm3s?.timestamp_osm_base)throw Error('venue_raw_source_snapshot');
  return {snapshot:{osmBase:raw.osm3s.timestamp_osm_base},ways:raw.elements.filter(e=>e.type==='way'&&e.tags?.highway==='raceway').map(e=>({id:e.id,version:e.version,timestamp:e.timestamp,nodes:e.nodes,geometry:e.geometry,tags:e.tags}))};
 }
 if(format!=='osm-api-map-json-v1'||Number(raw.version)!==.6||!Array.isArray(raw.elements)||
  !source.endpoint?.startsWith('https://api.openstreetmap.org/api/0.6/map.json?bbox=')||
  !Number.isFinite(Date.parse(source.observedAt))||!String(raw.copyright).includes('OpenStreetMap'))throw Error('venue_raw_source_format');
 const bounds=raw.bounds,coverage=source.coverage;
 if(!bounds||!coverage||[['minlat','south'],['minlon','west'],['maxlat','north'],['maxlon','east']].some(([a,b])=>!Number.isFinite(bounds[a])||bounds[a]!==coverage[b]))throw Error('venue_raw_source_coverage');
 const nodes=new Map();
 for(const node of raw.elements.filter(e=>e.type==='node')){
  if(!Number.isSafeInteger(node.id)||node.id<=0||nodes.has(node.id)||!Number.isFinite(node.lat)||!Number.isFinite(node.lon)||Math.abs(node.lat)>85||Math.abs(node.lon)>180)throw Error('venue_raw_source_node');
  nodes.set(node.id,{lat:node.lat,lon:node.lon});
 }
 const ways=raw.elements.filter(e=>e.type==='way'&&e.tags?.highway==='raceway').map(e=>{
  if(!Array.isArray(e.nodes))throw Error('venue_raw_source_way');
  const geometry=e.nodes.map(id=>{const point=nodes.get(id);if(!point)throw Error('venue_raw_source_incomplete_way');return point;});
  return {id:e.id,version:e.version,timestamp:e.timestamp,nodes:e.nodes,geometry,tags:e.tags};
 });
 // An API response date is an observation, not an Overpass replication base.
 return {snapshot:{observedAt:source.observedAt},ways};
}
