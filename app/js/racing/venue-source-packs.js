import {normalizeRaceVenueSource} from './venue-course-policy.js';
import {compileMappedVenueLayout,geographicVenueDistance} from './venue-layout.js';
import {authorVenueEdgeRecipes} from './venue-edge-authoring.js';
import {annotateRoadSourceSurvey} from '../world/road-source-survey.js';
import {sha256Text} from '../terrain/ground-artifact.js?v=4';
import {parseMeters} from '../world/compiler/transport-source-normalizer.js?v=4';
import {annotateReviewedVenueDecks,reviewedVenueDeckProfile,reviewedVenuePavementProfile} from './venue-deck-source.js';

// A reviewed source package is not a playable-catalogue flag. Admission still
// requires the existing world publication and racing surface qualification.
export const RACING_VENUE_SOURCES=Object.freeze([Object.freeze({
 id:'silverstone-grand-prix',name:'Silverstone',anchor:Object.freeze({lat:52.0713,lon:-1.0168}),
 sourceUrl:'/app/assets/racing/silverstone/source.json',sourceSha256:'c41a9f0d43e21af306fbf3261996e997a036778205acaa28df2697ef424c2b00',
 groundArtifactId:'silverstone-gp-fine-v1',groundContentSha256:'1b1f66af6f8bcbd9db84abe0b123d69bb016955d06afcb55d2a0aee782c306bd',
 maximumCrossfall:.15,qualificationRadiusWorld:1200
}),Object.freeze({
 id:'nurburgring-nordschleife',name:'Nürburgring · Nordschleife',anchor:Object.freeze({lat:50.359,lon:6.963}),
 sourceUrl:'/app/assets/racing/nordschleife/source.json',sourceSha256:'0fcd281250a971a66b795850d1657541b475cba5e3ac249e21a3a0439d3a5d26',
 groundArtifactId:'nordschleife-fine-sw-v1',groundContentSha256:'bb51f5766addeb02d59e2d6a9f68c84787b32f2e0907586b5f0ccfcd68cc82c1',
 groundArtifacts:Object.freeze([
  Object.freeze({artifactId:'nordschleife-fine-sw-v1',contentSha256:'bb51f5766addeb02d59e2d6a9f68c84787b32f2e0907586b5f0ccfcd68cc82c1'}),
  Object.freeze({artifactId:'nordschleife-fine-se-v1',contentSha256:'085e6b3bf3919b20fbd7419c734a1392ddf19c28d9216c96c96185b8b0c4552d'}),
  Object.freeze({artifactId:'nordschleife-fine-nw-v1',contentSha256:'8ef2dc7bb03787f248da570967d902cfa917f2dbce02929f5581e1a64baba428'}),
  Object.freeze({artifactId:'nordschleife-fine-ne-v1',contentSha256:'11e185425a7ae941d59bb666a0ac14132d8e2892bb290f86a91c115897711945'})
 ]),
 landscapeGroundArtifacts:Object.freeze([
  Object.freeze({artifactId:'nordschleife-landscape-north-v1',contentSha256:'b3710270f8216f8c46d6dce46445cf937dd4a5cd33b732ab6dedc8814a9d829c'}),
  Object.freeze({artifactId:'nordschleife-landscape-south-v1',contentSha256:'5a2f5162b8474d54d64972cae624791be5cf9e9560f427546a449f244fe9f9cf'}),
  Object.freeze({artifactId:'nordschleife-landscape-west-v1',contentSha256:'2f4289dd7f8e26359c9543f27b932ceb19b39ca357191a4d115340466f7aa4fd'}),
  Object.freeze({artifactId:'nordschleife-landscape-east-v1',contentSha256:'a19294eb018bf9d130593592029bc0847f4d381851152642731ef79bff3c3783'})
 ]),
 reviewedDeckProfiles:Object.freeze({url:'/app/assets/racing/nordschleife/decks.json',contentSha256:'586ba8daef6c299170ea0a619cec2bed4b40ba57f09cec6522f4b187fdc62647'}),
 pavementWidthPolicy:'mapped',surfaceModel:'banked-road-v1',maximumCrossfall:.7,qualificationRadiusWorld:3500,
 routeExtent:'mapped-venue-v1',motorAccess:'virtual-raceway-v1',raceAdmission:'practice',layoutLabel:'T13',
 // Original game timing on the retained T13 straight, aligned to the visible
 // transverse paint in RLP DOP20. This is not a surveyed official timing marker.
 startLine:Object.freeze({sourceFeatureId:'osm:way:41395670',segment:6,fraction:.725}),
 presentationStatus:'under-construction',edgeBandAuthoring:'mapped-bend-game-dressing-v1',
 // Wider visual relief uses the same native source plus its retained perimeter tiles.
 // Feather inside the outer coverage border; the physical road corridor is unchanged.
 landscapeRefinement:Object.freeze({radiusMeters:350,fullHeightRadiusMeters:150,spacingMeters:32,coverageFadeMeters:70,
  coverage:Object.freeze({south:50.33179264672786,north:50.38642068124047,west:6.911350335124666,east:7.014189468850645})})
})]);
export function racingVenueSourceAt(location){
 if(!location||!Number.isFinite(location.lat)||!Number.isFinite(location.lon))return null;
 return RACING_VENUE_SOURCES.find(pack=>geographicVenueDistance(pack.anchor,location)<=15)||null;
}
// Physical road/deck proofs retain their original group. World activation also
// requires the explicit visual perimeter through the same accepted ground owner.
export function racingVenueGroundRequirements(descriptor,{includeLandscape=false}={}){
 const physical=descriptor.groundArtifacts||[{artifactId:descriptor.groundArtifactId,contentSha256:descriptor.groundContentSha256}],landscape=descriptor.landscapeGroundArtifacts;
 if(landscape!==undefined&&(!Array.isArray(landscape)||!landscape.length||landscape.length>8))throw Error('venue_landscape_ground_group_invalid');
 const required=includeLandscape&&landscape?[...physical,...landscape]:physical;
 if(!Array.isArray(required)||!required.length||required.length>32||required.some(item=>typeof item?.artifactId!=='string'||!item.artifactId||item.artifactId.length>160||!/^[a-f0-9]{64}$/.test(item.contentSha256))||new Set(required.map(item=>item.artifactId)).size!==required.length||
  !required.some(item=>item.artifactId===descriptor.groundArtifactId&&item.contentSha256===descriptor.groundContentSha256))throw Error('venue_ground_group_invalid');
 return Object.freeze(required.map(item=>Object.freeze({artifactId:item.artifactId,contentSha256:item.contentSha256})));
}
function maximumPavementWidth(source,layout,descriptor){
 const usable=source.layout.usableWidthMeters,policy=descriptor.pavementWidthPolicy||'usable-corridor';
 if(!['usable-corridor','mapped'].includes(policy))throw Error('venue_pavement_width_policy_invalid');
 if(policy==='usable-corridor')return usable;
 const widths=layout.wayIds.map(id=>parseMeters(layout.ways.get(id).tags.width));
 if(widths.some(width=>!Number.isFinite(width)||width<usable||width>24))throw Error('venue_mapped_pavement_width_invalid');
 return Math.max(...widths);
}
function reviewedStartLine(descriptor,layout){
 const line=descriptor.startLine;if(line===undefined)return undefined;
 const id=Number(String(line?.sourceFeatureId).replace(/^osm:way:/,'')),way=layout.ways.get(id);
 if(!layout.wayIds.includes(id)||line.sourceFeatureId!==`osm:way:${id}`||!Number.isInteger(line.segment)||line.segment<0||line.segment>=way.nodes.length-1||
  !Number.isFinite(line.fraction)||line.fraction<=0||line.fraction>=1)throw Error('venue_start_line_invalid');
 return Object.freeze({sourceFeatureId:line.sourceFeatureId,segment:line.segment,fraction:line.fraction});
}
function reviewedLandscapeRefinement(descriptor){
 const policy=descriptor.landscapeRefinement;if(policy===undefined)return undefined;
 const {radiusMeters,fullHeightRadiusMeters,spacingMeters,coverageFadeMeters,coverage}=policy;
 if(![radiusMeters,fullHeightRadiusMeters,spacingMeters,coverageFadeMeters].every(Number.isFinite)||
  radiusMeters>512||fullHeightRadiusMeters<60||radiusMeters<=fullHeightRadiusMeters||spacingMeters<8||spacingMeters>64||
  coverageFadeMeters<20||coverageFadeMeters>fullHeightRadiusMeters||
  !coverage||!['south','north','west','east'].every(k=>Number.isFinite(coverage[k]))||coverage.south< -90||coverage.north>90||
  coverage.west< -180||coverage.east>180||coverage.south>=coverage.north||coverage.west>=coverage.east)throw Error('venue_landscape_policy_invalid');
 return Object.freeze({radiusMeters,fullHeightRadiusMeters,spacingMeters,coverageFadeMeters,coverage:Object.freeze({...coverage})});
}
export function createRacingVenueGroundPlan(descriptor,source){
 const layout=compileMappedVenueLayout(source),requiredArtifacts=racingVenueGroundRequirements(descriptor,{includeLandscape:true}),coverageProbes=[];
 if(layout.venueId!==descriptor.id||!(source.layout.usableWidthMeters>=6&&source.layout.usableWidthMeters<=30))throw Error('venue_source_identity_mismatch');
 const halfWidth=maximumPavementWidth(source,layout,descriptor)*.5+2,landscape=reviewedLandscapeRefinement(descriptor),metersPerDegree=6371008.8*Math.PI/180;
 for(let index=1;index<layout.points.length;index++){
  const a=layout.points[index-1],b=layout.points[index],length=geographicVenueDistance(a,b),steps=Math.max(1,Math.ceil(length/2));
  const east=(b.lon-a.lon)*Math.cos((a.lat+b.lat)*Math.PI/360)*metersPerDegree,north=(b.lat-a.lat)*metersPerDegree;
  const magnitude=Math.hypot(east,north);
  for(let step=0;step<=steps;step++){
   const t=step/steps,lat=a.lat+(b.lat-a.lat)*t,lon=a.lon+(b.lon-a.lon)*t;
   for(const lateral of [-halfWidth,0,halfWidth])coverageProbes.push(Object.freeze({latitude:lat+east/magnitude*lateral/metersPerDegree,
    longitude:lon-north/magnitude*lateral/(metersPerDegree*Math.cos(lat*Math.PI/180))}));
   if(coverageProbes.length>60000)throw Error('venue_ground_probe_bound');
  }
 }
 if(landscape){
  const {coverage:c,radiusMeters}=landscape,epsilon=.000001;
  for(let index=1;index<layout.points.length;index++){
   const a=layout.points[index-1],b=layout.points[index],steps=Math.max(1,Math.ceil(geographicVenueDistance(a,b)/100)),
    east=(b.lon-a.lon)*Math.cos((a.lat+b.lat)*Math.PI/360)*metersPerDegree,north=(b.lat-a.lat)*metersPerDegree,magnitude=Math.hypot(east,north);
   if(!magnitude)continue;
   for(let step=0;step<=steps;step++)for(const lateral of[-radiusMeters,-radiusMeters/2,0,radiusMeters/2,radiusMeters]){
    const t=step/steps,lat=a.lat+(b.lat-a.lat)*t,lon=a.lon+(b.lon-a.lon)*t;
    coverageProbes.push(Object.freeze({latitude:Math.max(c.south+epsilon,Math.min(c.north-epsilon,lat+east/magnitude*lateral/metersPerDegree)),
     longitude:Math.max(c.west+epsilon,Math.min(c.east-epsilon,lon-north/magnitude*lateral/(metersPerDegree*Math.cos(lat*Math.PI/180))))}));
    if(coverageProbes.length>60000)throw Error('venue_ground_probe_bound');
   }
  }
 }
 return Object.freeze({requiredArtifacts,coverageProbes:Object.freeze(coverageProbes)});
}
const inside=(point,bounds)=>point&&point.lat>=bounds.south&&point.lat<=bounds.north&&point.lon>=bounds.west&&point.lon<=bounds.east;
export function prepareVenueSourceMerge(data,source,descriptor,ground){
 const required=racingVenueGroundRequirements(descriptor);
 if(ground?.status!=='accepted'||racingVenueGroundRequirements(descriptor,{includeLandscape:true}).some(item=>{
  const index=ground.artifactIds?.indexOf(item.artifactId)??-1;
  return index<0||ground.contentSha256s?.[index]!==item.contentSha256;
 }))throw Error('venue_ground_not_ready');
 const layout=compileMappedVenueLayout(source);
 if(layout.venueId!==descriptor.id||!(source.layout.usableWidthMeters>=6&&source.layout.usableWidthMeters<=30))throw Error('venue_source_identity_mismatch');
 maximumPavementWidth(source,layout,descriptor);
 const startLine=reviewedStartLine(descriptor,layout),landscapeRefinement=reviewedLandscapeRefinement(descriptor);
 if(descriptor.routeExtent!==undefined&&descriptor.routeExtent!=='mapped-venue-v1')throw Error('venue_route_extent_invalid');
 const venueSource=descriptor.routeExtent?normalizeRaceVenueSource({version:1,id:descriptor.id,sourceSha256:descriptor.sourceSha256,
  mappedLengthMeters:layout.lengthMeters,qualificationRadiusWorld:descriptor.qualificationRadiusWorld,sourceFeatureIds:layout.wayIds.map(id=>`osm:way:${id}`)}):undefined;
 const edgeRecipes=authorVenueEdgeRecipes(layout,descriptor);
 const original=Array.isArray(data?.elements)?data.elements:[],existingNodes=new Map(original.filter(e=>e.type==='node').map(e=>[e.id,e]));
 const sourceWays=new Map(source.ways.map(w=>[w.id,w])),layoutWays=new Set(layout.wayIds),bounds=source.source?.coverage;
 if(!bounds||!['south','north','west','east'].every(k=>Number.isFinite(bounds[k]))||bounds.south>=bounds.north||bounds.west>=bounds.east)throw Error('venue_source_coverage_invalid');
 const elements=new Map();let retiredGeneralized=0;
 for(const item of original){
  if(item.type==='way'&&sourceWays.has(item.id)){
   const pinned=sourceWays.get(item.id);
   if(Number(item.version)>pinned.version)throw Error('venue_source_revision_obsolete');
   continue;
  }
  // The extract explicitly contains ALL raceways in this finite query area.
  // Replace only fully contained generalized raceways, preserving public
  // roads, other decks, buildings, waterways and partially covered source ways.
  if(item.type==='way'&&item.tags?.highway==='raceway'&&item.tags?._sourceCompleteness==='generalized'&&item.nodes?.length>=2&&
    item.nodes.every(id=>inside(existingNodes.get(id),bounds))){retiredGeneralized++;continue;}
  elements.set(`${item.type}:${item.id}`,item);
 }
 for(const [id,point] of layout.nodes){
  const old=existingNodes.get(id);
  if(old&&geographicVenueDistance(old,point)>.02)throw Error('venue_source_node_revision_conflict');
  elements.set(`node:${id}`,{...old,type:'node',id,lat:point.lat,lon:point.lon});
 }
 for(const raw of source.ways){
  const deck=layoutWays.has(raw.id)?reviewedVenueDeckProfile(source,descriptor,raw.id):null;
  const pavement=layoutWays.has(raw.id)?reviewedVenuePavementProfile(source,descriptor,raw.id):null;
  const sourceFeatureId=`osm:way:${raw.id}`,way={type:'way',id:raw.id,version:raw.version,nodes:[...raw.nodes],tags:{...raw.tags,_sourceFeatureId:sourceFeatureId,_sourceCompleteness:'lossless',...(!layoutWays.has(raw.id)?{_regionalContext:'fixed-location'}:{})}};
  if(layoutWays.has(raw.id))annotateRoadSourceSurvey(way,{version:1,venueId:descriptor.id,sourceFeatureId,...(venueSource?{venueSource}:{}),
   ...(descriptor.pavementWidthPolicy==='mapped'?{pavementWidthPolicy:'mapped'}:{}),
   usableWidthMeters:source.layout.usableWidthMeters,maximumCrossfall:descriptor.maximumCrossfall,
   ...(descriptor.surfaceModel?{surfaceModel:descriptor.surfaceModel}:{}),
   ...(descriptor.motorAccess?{motorAccess:descriptor.motorAccess}:{}),
   ...(deck?{geographicDeckProfile:deck}:{}),
   ...(pavement?{geographicPavementProfile:pavement}:{}),
   ...(!deck&&!pavement&&edgeRecipes.has(raw.id)?{edgeBandRecipe:edgeRecipes.get(raw.id)}:{}),
   groundArtifactId:descriptor.groundArtifactId,groundContentSha256:descriptor.groundContentSha256,groundArtifacts:required});
  elements.set(`way:${raw.id}`,way);
 }
 return {data:{...data,elements:[...elements.values()]},metadata:Object.freeze({id:descriptor.id,name:descriptor.name,status:'source-prepared',
  ...(startLine?{startLine,layoutLabel:descriptor.layoutLabel||'Circuit'}:{}),
  ...(descriptor.presentationStatus?{presentationStatus:descriptor.presentationStatus}:{}),
  ...(landscapeRefinement?{landscapeRefinement}:{}),
  ...(descriptor.landscapeGroundArtifacts?{landscapeGroundArtifacts:descriptor.landscapeGroundArtifacts}:{}),
  ...(venueSource?{venueSource}:{}),...(descriptor.raceAdmission?{raceAdmission:descriptor.raceAdmission}:{}),sourceSha256:descriptor.sourceSha256,sourceDate:source.source.osmBase,layoutWayIds:Object.freeze([...layout.wayIds]),
  sourceFeatureIds:Object.freeze(layout.wayIds.map(id=>`osm:way:${id}`)),mappedLengthMeters:layout.lengthMeters,
  referenceLengthMeters:layout.referenceLengthMeters,qualificationRadiusWorld:descriptor.qualificationRadiusWorld,
  groundArtifactId:descriptor.groundArtifactId,groundContentSha256:descriptor.groundContentSha256,groundArtifacts:required,retiredGeneralized})};
}
export async function loadRacingVenueSource(descriptor,{fetchImpl=globalThis.fetch,signal}={}){
 const response=await fetchImpl(descriptor.sourceUrl,{signal});
 if(!response.ok)throw Error('venue_source_fetch_failed');
 const text=await response.text();
 if(signal?.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');
 if(text.length>2000000||await sha256Text(text)!==descriptor.sourceSha256)throw Error('venue_source_integrity_failed');
 if(signal?.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');
 const source=JSON.parse(text),profile=descriptor.reviewedDeckProfiles;
 if(profile){
  if(typeof profile.url!=='string'||!/^\/app\/assets\/racing\/[A-Za-z0-9_/-]+\.json$/.test(profile.url)||!/^[a-f0-9]{64}$/.test(profile.contentSha256))throw Error('venue_deck_descriptor_invalid');
  const response=await fetchImpl(profile.url,{signal});if(!response.ok)throw Error('venue_deck_source_fetch_failed');
  const bytes=await response.text();
  if(signal?.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');
  if(bytes.length>1024*1024||await sha256Text(bytes)!==profile.contentSha256)throw Error('venue_deck_source_integrity_failed');
  if(signal?.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');
  annotateReviewedVenueDecks(source,JSON.parse(bytes),{descriptor,requiredArtifacts:racingVenueGroundRequirements(descriptor),contentSha256:profile.contentSha256});
 }
 return source;
}
