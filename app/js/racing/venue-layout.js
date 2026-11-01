// Independently reusable mapped facts. This validator does not make a venue
// playable: the world must still publish and collision-qualify its full surface.
import {RACE_MINIMUM_SPAN_METERS} from './course-rules.js';
import {normalizeRallyStage} from './rally-rules.js';
// Stage intake retains motor-road facts. A source's highway/access tags are
// never rewritten to raceway to obtain a closed-event capability.
export const MAPPED_STAGE_HIGHWAYS=Object.freeze(['raceway','primary','secondary','tertiary','unclassified','residential','service','track','road']);
const geographic=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=85&&Math.abs(p.lon)<=180;
export function geographicVenueDistance(a,b){
 const r=Math.PI/180,lat1=a.lat*r,lat2=b.lat*r,dlat=lat2-lat1,dlon=(b.lon-a.lon)*r;
 return 12742017.6*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2)));
}
export function compileMappedVenueLayout(source){
 const stage=source?.schemaVersion===2&&source.layout?.kind==='open-stage-v1'&&source.layout.closed===false;
 if((source?.schemaVersion!==1&&!stage)||!source.venueId||source.license!=='ODbL-1.0'||!Array.isArray(source.ways)||!source.ways.length||source.ways.length>2000||
  (stage?(!Array.isArray(source.layout.legs)||!source.layout.legs.length||source.layout.legs.length>500||source.layout.wayIds!==undefined):
   (!Array.isArray(source.layout?.wayIds)||!source.layout.wayIds.length||source.layout.wayIds.length>500||source.layout.closed!==true)))throw Error('venue_source_invalid');
 const ways=new Map(),nodes=new Map();let pointsCount=0;
 for(const way of source.ways){
  if(!Number.isSafeInteger(way.id)||way.id<=0||ways.has(way.id)||!(stage?MAPPED_STAGE_HIGHWAYS.includes(way.tags?.highway):way.tags?.highway==='raceway')||!Array.isArray(way.nodes)||way.nodes.length<2||
   !Array.isArray(way.geometry)||way.nodes.length!==way.geometry.length||(pointsCount+=way.nodes.length)>30000)throw Error('venue_way_invalid');
  for(let index=0;index<way.nodes.length;index++){
   const id=way.nodes[index],point=way.geometry[index],previous=nodes.get(id);
   if(!Number.isSafeInteger(id)||id<=0||!geographic(point)||previous&&geographicVenueDistance(previous,point)>.001)throw Error('venue_node_conflict');
   nodes.set(id,point);
  }
  ways.set(way.id,way);
 }
 if(stage)return compileOpenStage(source,ways,nodes);
 const ordered=[],seen=new Set();let lengthMeters=0,previous=null;
 for(const id of source.layout.wayIds){
  const way=ways.get(id);
  if(!way||seen.has(id)||way.tags.oneway==='-1'||way.tags.oneway==='reverse'||['pit_lane','pitlane'].includes(way.tags.raceway))throw Error('venue_layout_way_invalid');
  if(previous!==null&&previous!==way.nodes[0])throw Error('venue_layout_disconnected');
  seen.add(id);
  way.geometry.forEach((point,index)=>{
   if(index){const length=geographicVenueDistance(way.geometry[index-1],point);if(length<RACE_MINIMUM_SPAN_METERS||length>1000)throw Error('venue_segment_invalid');lengthMeters+=length;}
   if(!ordered.length||index>0)ordered.push({...point,nodeId:way.nodes[index],wayId:id});
  });
  previous=way.nodes.at(-1);
 }
 if(ordered[0].nodeId!==ordered.at(-1).nodeId)throw Error('venue_layout_not_closed');
 const reference=source.layout.referenceLengthMeters;
 if(!Number.isFinite(reference)||reference<500||reference>30000||Math.abs(lengthMeters-reference)/reference>.01)throw Error('venue_layout_length_mismatch');
 return Object.freeze({venueId:source.venueId,points:Object.freeze(ordered.map(Object.freeze)),lengthMeters,referenceLengthMeters:reference,
  lengthDifferenceMeters:lengthMeters-reference,wayIds:Object.freeze([...source.layout.wayIds]),ways,nodes});
}

function compileOpenStage(source,ways,nodes){
 const points=[],legs=[],wayIds=[],used=new Set();let lengthMeters=0,previous=null;
 for(const leg of source.layout.legs){
  const way=ways.get(leg?.wayId),start=way?.nodes.indexOf(leg?.startNodeId),end=way?.nodes.indexOf(leg?.endNodeId);
  if(!way||start<0||end<0||start===end||way.nodes.lastIndexOf(leg.startNodeId)!==start||way.nodes.lastIndexOf(leg.endNodeId)!==end||
   previous!==null&&previous!==leg.startNodeId)throw Error('venue_stage_leg_invalid');
  const reverse=end<start,oneway=way.tags.oneway;
  if(![undefined,'yes','1','true','-1','reverse','no','0','false'].includes(oneway)||
   reverse&&['yes','1','true'].includes(oneway)||!reverse&&['-1','reverse'].includes(oneway))throw Error('venue_stage_direction_unavailable');
  const step=reverse?-1:1;
  if(!wayIds.includes(way.id))wayIds.push(way.id);
  for(let index=start;;index+=step){
   if(index!==start){
    const segment=Math.min(index,index-step),key=way.id+':'+segment;
    if(used.has(key))throw Error('venue_stage_segment_repeated');used.add(key);
    const length=geographicVenueDistance(way.geometry[index-step],way.geometry[index]);
    if(length<RACE_MINIMUM_SPAN_METERS||length>1000)throw Error('venue_segment_invalid');lengthMeters+=length;
   }
   if(!points.length||index!==start)points.push({...way.geometry[index],nodeId:way.nodes[index],wayId:way.id});
   if(index===end)break;
  }
  legs.push(Object.freeze({sourceFeatureId:`osm:way:${way.id}`,startSegment:Math.min(start,end),endSegment:Math.max(start,end),direction:reverse?'reverse':'forward'}));
  previous=leg.endNodeId;
 }
 if(points[0].nodeId===points.at(-1).nodeId)throw Error('venue_stage_not_open');
 if(wayIds.length!==ways.size)throw Error('venue_stage_foreign_way');
 const reference=source.layout.referenceLengthMeters,width=source.layout.usableWidthMeters;
 if(!Number.isFinite(reference)||reference<500||reference>30000||Math.abs(lengthMeters-reference)/reference>.01)throw Error('venue_layout_length_mismatch');
 if(!Number.isFinite(width)||width<3||width>30)throw Error('venue_stage_width_invalid');
 const rally=normalizeRallyStage(source.layout.rally,legs);
 return Object.freeze({venueId:source.venueId,kind:'open-stage-v1',points:Object.freeze(points.map(Object.freeze)),lengthMeters,
  referenceLengthMeters:reference,lengthDifferenceMeters:lengthMeters-reference,wayIds:Object.freeze(wayIds),ways,nodes,
  stage:Object.freeze({kind:'open-stage-v1',minimumWidthMeters:width,startNodeId:points[0].nodeId,finishNodeId:points.at(-1).nodeId,legs:Object.freeze(legs),...(rally?{rally}:{})})});
}

// A separately reviewed open branch; it never changes the ordered race loop.
export function compileMappedVenuePitLayout(source,descriptor,layout=compileMappedVenueLayout(source)){
 const ids=descriptor?.pitWayIds;if(ids===undefined)return null;
 const fail=()=>{throw Error('venue_pit_layout_invalid');};
 if(layout.kind==='open-stage-v1')fail();
 if(!Array.isArray(ids)||!ids.length||ids.length>50||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)||layout.wayIds.includes(id)||!layout.ways.has(id)))fail();
 const mainNodes=new Set(layout.wayIds.flatMap(id=>layout.ways.get(id).nodes)),points=[];let previous=null,lengthMeters=0;
 for(const id of ids){const way=layout.ways.get(id);if(!['yes','1','true'].includes(way.tags.oneway)||previous!==null&&previous!==way.nodes[0])fail();
  for(let i=0;i<way.nodes.length;i++){
   if(i){const distance=geographicVenueDistance(way.geometry[i-1],way.geometry[i]);if(distance<RACE_MINIMUM_SPAN_METERS||distance>1000)fail();lengthMeters+=distance;}
   if(!points.length||i>0)points.push({...way.geometry[i],nodeId:way.nodes[i],wayId:id});
  }previous=way.nodes.at(-1);
 }
 if(lengthMeters<200||lengthMeters>2000||points[0].nodeId===points.at(-1).nodeId||!mainNodes.has(points[0].nodeId)||!mainNodes.has(points.at(-1).nodeId)||points.slice(1,-1).some(p=>mainNodes.has(p.nodeId)))fail();
 const neighbour=(node,outgoing)=>{
  for(const id of layout.wayIds){const w=layout.ways.get(id),at=w.nodes.indexOf(node);if(at<0)continue;if(outgoing&&at<w.nodes.length-1)return w.geometry[at+1];if(!outgoing&&at>0)return w.geometry[at-1];}
  fail();
 };
 return Object.freeze({wayIds:Object.freeze([...ids]),sourceFeatureIds:Object.freeze(ids.map(id=>`osm:way:${id}`)),points:Object.freeze(points.map(Object.freeze)),lengthMeters,
  mainContinuations:Object.freeze({start:Object.freeze({...neighbour(points[0].nodeId,false)}),end:Object.freeze({...neighbour(points.at(-1).nodeId,true)})})});
}
