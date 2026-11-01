// Presentation cover is pinned beside the existing venue pack and published
// through ordinary landuse/water owners. No second ground or asset registry.
const landscapeBySource=new WeakMap();
export function annotateReviewedVenueLandscape(source,descriptor,pack){
 if(pack?.schemaVersion!==1||pack.venueId!==descriptor.id||pack.courseSourceSha256!==descriptor.sourceSha256||pack.license!=='ODbL-1.0'||!Array.isArray(pack.ways)||pack.ways.length>500)throw Error('venue_landscape_identity_mismatch');
 let count=0;
 for(const way of pack.ways){if(!Number.isSafeInteger(way.id)||!Number.isInteger(way.version)||!Array.isArray(way.nodes)||way.nodes.length<4||way.nodes[0]!==way.nodes.at(-1)||way.nodes.length!==way.geometry?.length||(count+=way.nodes.length)>12000||way.geometry.some(p=>!Array.isArray(p)||p.length!==2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>90||Math.abs(p[1])>180)||!(way.tags?.landuse||way.tags?.natural)||way.tags.highway)throw Error('venue_landscape_invalid');}
 landscapeBySource.set(source,pack);return source;
}
export function mergeReviewedVenueLandscape(elements,descriptor,source){
 const pack=landscapeBySource.get(source);if(!pack)return 0;
 if(pack.courseSourceSha256!==descriptor.sourceSha256)throw Error('venue_landscape_identity_mismatch');
 let count=0;
 for(const raw of pack.ways){
  const previous=elements.get('way:'+raw.id);if(Number(previous?.version)>raw.version)continue;
  for(let i=0;i<raw.nodes.length;i++){
   const id=raw.nodes[i],[lat,lon]=raw.geometry[i],old=elements.get('node:'+id);
   if(old&&(Math.abs(old.lat-lat)>2e-7||Math.abs(old.lon-lon)>2e-7))throw Error('venue_landscape_node_revision_conflict');
   if(!old)elements.set('node:'+id,{type:'node',id,lat,lon});
  }
  elements.set('way:'+raw.id,{type:'way',id:raw.id,version:raw.version,nodes:[...raw.nodes],tags:{...raw.tags,_sourceFeatureId:'osm:way:'+raw.id,_sourceCompleteness:'lossless',_regionalContext:'fixed-location'}});count++;
 }
 return count;
}
