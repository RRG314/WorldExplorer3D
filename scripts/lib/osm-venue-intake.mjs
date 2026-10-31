// Offline adaptation of a hash-pinned finite OSM response. Account metadata
// never enters the independently reusable venue source.
import {MAPPED_STAGE_HIGHWAYS} from '../../app/js/racing/venue-layout.js';
import {createHash} from 'node:crypto';
export function osmVenueIntake(raw,source,{stageWayIds}={}){
 let selected=null;
 if(stageWayIds!==undefined){
  if(!Array.isArray(stageWayIds)||!stageWayIds.length||stageWayIds.length>500||stageWayIds.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(stageWayIds).size!==stageWayIds.length)throw Error('venue_stage_selection_invalid');
  selected=new Set(stageWayIds);
 }
 const wanted=e=>e.type==='way'&&(selected?selected.has(e.id):e.tags?.highway==='raceway');
 const validate=ways=>{
  if(selected&&(ways.length!==selected.size||new Set(ways.map(w=>w.id)).size!==selected.size||ways.some(w=>!MAPPED_STAGE_HIGHWAYS.includes(w.tags?.highway))))throw Error('venue_stage_source_incomplete');
  return ways;
 };
 const format=source.format||'overpass-geom-json-v1';
 if(format==='osm-api-map-bundle-json-v1'){
  const parts=source.parts,c=source.coverage,valid=b=>b&&['south','west','north','east'].every(k=>Number.isFinite(b[k]))&&b.south<b.north&&b.west<b.east;
  if(!Array.isArray(parts)||!parts.length||parts.length>16||!Array.isArray(raw?.parts)||raw.parts.length!==parts.length||!valid(c))throw Error('venue_raw_bundle_invalid');
  const merged=new Map();let area=0;
  for(let i=0;i<parts.length;i++){
   const p=parts[i],b=p.coverage,body=raw.parts[i]?.body;
   if(p.format!=='osm-api-map-json-v1'||!valid(b)||b.south<c.south||b.north>c.north||b.west<c.west||b.east>c.east||
    typeof body!=='string'||Buffer.byteLength(body)>12*1024**2||createHash('sha256').update(body).digest('hex')!==p.responseSha256)throw Error('venue_raw_bundle_part_invalid');
   for(let j=0;j<i;j++){const a=parts[j].coverage;if(Math.min(a.east,b.east)>Math.max(a.west,b.west)&&Math.min(a.north,b.north)>Math.max(a.south,b.south))throw Error('venue_raw_bundle_overlap');}
   area+=(b.east-b.west)*(b.north-b.south);
   const input=JSON.parse(body),available=selected?[...selected].filter(id=>input.elements?.some(e=>e.type==='way'&&e.id===id)):null,
    result=osmVenueIntake(input,p,available?.length?{stageWayIds:available}:{});
   for(const way of result.ways){
    if(selected&&!selected.has(way.id))continue;
    const previous=merged.get(way.id);if(previous&&JSON.stringify(previous)!==JSON.stringify(way))throw Error('venue_raw_bundle_way_conflict');
    merged.set(way.id,way);
   }
  }
  if(Math.abs(area-(c.east-c.west)*(c.north-c.south))>1e-12)throw Error('venue_raw_bundle_incomplete_coverage');
  return {snapshot:{observedAt:parts.at(-1).observedAt},ways:validate([...merged.values()].sort((a,b)=>a.id-b.id))};
 }
 if(format==='overpass-geom-json-v1'){
  if(!raw.osm3s?.timestamp_osm_base)throw Error('venue_raw_source_snapshot');
  return {snapshot:{osmBase:raw.osm3s.timestamp_osm_base},ways:validate(raw.elements.filter(wanted).map(e=>({id:e.id,version:e.version,timestamp:e.timestamp,nodes:e.nodes,geometry:e.geometry,tags:e.tags})))};
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
 const ways=validate(raw.elements.filter(wanted).map(e=>{
  if(!Array.isArray(e.nodes))throw Error('venue_raw_source_way');
  const geometry=e.nodes.map(id=>{const point=nodes.get(id);if(!point)throw Error('venue_raw_source_incomplete_way');return point;});
  return {id:e.id,version:e.version,timestamp:e.timestamp,nodes:e.nodes,geometry,tags:e.tags};
 }));
 // An API response date is an observation, not an Overpass replication base.
 return {snapshot:{observedAt:source.observedAt},ways};
}
