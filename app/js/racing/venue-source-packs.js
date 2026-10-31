import {mergeReviewedVenueLandscape,annotateReviewedVenueLandscape} from './venue-landscape-source.js';
import {normalizeRaceVenueSource} from './venue-course-policy.js';
import {compileMappedVenueLayout,compileMappedVenuePitLayout,geographicVenueDistance} from './venue-layout.js';
import {authorVenueEdgeRecipes} from './venue-edge-authoring.js';
import {annotateReviewedVenuePavementSections,reviewedVenuePavementSections} from './venue-pavement-source.js';
import {annotateRoadSourceSurvey} from '../world/road-source-survey.js';
import {sha256Text} from '../terrain/ground-artifact.js?v=4';
import {parseMeters} from '../world/compiler/transport-source-normalizer.js?v=4';
import {annotateReviewedVenueDecks,reviewedVenueDeckProfile,reviewedVenuePavementProfile} from './venue-deck-source.js';
import {REVIEWED_CORRIDOR_OUTER_MARGIN_METERS,REVIEWED_PAVEMENT_BOUNDARY_POLICY} from '../terrain/reviewed-corridor-policy.js';

// A reviewed source package is not a playable-catalogue flag. Admission still
// requires the existing world publication and racing surface qualification.
export const RACING_VENUE_SOURCES=Object.freeze([Object.freeze({
 id:'silverstone-grand-prix',name:'Silverstone',anchor:Object.freeze({lat:52.0713,lon:-1.0168}),
 reviewedLandscape:Object.freeze({url:'/app/assets/racing/silverstone/landscape.json',contentSha256:'b9a51532833c1700967bb7e31472b9ea72b24e5268ef33a494cf2bc3e6c046c4'}),
 sourceUrl:'/app/assets/racing/silverstone/source.json',sourceSha256:'c41a9f0d43e21af306fbf3261996e997a036778205acaa28df2697ef424c2b00',
 groundArtifactId:'silverstone-gp-fine-v1',groundContentSha256:'1b1f66af6f8bcbd9db84abe0b123d69bb016955d06afcb55d2a0aee782c306bd',
 maximumCrossfall:.15,qualificationRadiusWorld:1200,routeExtent:'mapped-venue-v1',raceDiscipline:'circuit',
 pitWayIds:Object.freeze([227902927]),pitUsableWidthMeters:6,pitPavementWidthPolicy:'usable-corridor'
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
}),Object.freeze({
 id:'daytona-tri-oval',name:'Daytona International Speedway',anchor:Object.freeze({lat:29.185,lon:-81.071}),
 reviewedLandscape:Object.freeze({url:'/app/assets/racing/daytona/landscape.json',contentSha256:'9cd9b10308df19926fe8d1443ab5a48fdb6c7bf7e4ab6df1f06b9b919a68dc07'}),
 sourceUrl:'/app/assets/racing/daytona/source.json',sourceSha256:'f0512eb33c8e4101a349d53c52dacc9ae03a7030ebff7585534328dd2f1ec5dc',
 groundArtifactId:'daytona-tri-oval-fine-v3',groundContentSha256:'54ab1fad6a2a80f7f62178ab7d58a2433e386d6360eaea1d583fef1ae0117942',
 reviewedPavementSections:Object.freeze({url:'/app/assets/racing/daytona/pavement-sections-v3.json',contentSha256:'07dd9be2492c9cd216c43ab85dc92cb24b9e0293e44c0a69a75b90d14f077d69'}),
 pitWayIds:Object.freeze([352067003,198465568]),raceDiscipline:'oval',
 pavementWidthPolicy:'profiled',surfaceModel:'banked-road-v1',maximumCrossfall:.7,qualificationRadiusWorld:1200,routeExtent:'mapped-venue-v1',
 // Original game reference on the retained frontstretch. It is deliberately
 // separate from an official surveyed finish line and leaves source bytes intact.
 startLine:Object.freeze({sourceFeatureId:'osm:way:11371365',segment:0,fraction:.6}),
 raceAdmission:'practice',presentationStatus:'under-construction',layoutLabel:'Tri-oval',terrainEdgePolicy:REVIEWED_PAVEMENT_BOUNDARY_POLICY
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
function maximumPavementWidth(source,layout,descriptor,pit=compileMappedVenuePitLayout(source,descriptor,layout)){
 const usable=source.layout.usableWidthMeters,policy=descriptor.pavementWidthPolicy||'usable-corridor';
 if(!['usable-corridor','mapped','profiled'].includes(policy))throw Error('venue_pavement_width_policy_invalid');
 const circuitPit=reviewedCircuitPitWidth(source,layout,descriptor,pit);
 let width=usable;
 if(policy==='profiled')width=Math.max(...[...layout.wayIds,...(circuitPit?[]:pit?.wayIds||[])].flatMap(id=>reviewedVenuePavementSections(source,descriptor,id).samples.map(s=>s.positiveMeters+s.negativeMeters)));
 else if(policy==='mapped'){
  const widths=layout.wayIds.map(id=>parseMeters(layout.ways.get(id).tags.width));
  if(widths.some(width=>!Number.isFinite(width)||width<usable||width>(layout.stage?30:24)))throw Error('venue_mapped_pavement_width_invalid');
  width=Math.max(...widths);
 }
 return Math.max(width,circuitPit?.physicalWidthMeters||0);
}
function reviewedStageLayout(layout,descriptor){
 if(!layout.stage)return false;
 if(!layout.stage.rally)throw Error('venue_stage_runtime_unavailable');
 if(descriptor.raceDiscipline!=='rally'||descriptor.routeExtent!=='mapped-venue-v1'||descriptor.motorAccess!=='virtual-stage-v1'||
  descriptor.pavementWidthPolicy!=='mapped'||descriptor.maximumCrossfall!==.15||descriptor.surfaceModel!==undefined||
  descriptor.startLine!==undefined||descriptor.pitWayIds!==undefined||descriptor.reviewedPavementSections!==undefined||
  descriptor.reviewedDeckProfiles!==undefined||descriptor.edgeBandAuthoring!==undefined)throw Error('venue_stage_review_unavailable');
 return true;
}
function reviewedCircuitPitWidth(source,layout,descriptor,pit){
 const explicit=descriptor.pitUsableWidthMeters!==undefined||descriptor.pitPavementWidthPolicy!==undefined;
 if(!pit){if(explicit)throw Error('venue_pit_review_unavailable');return null;}
 if(descriptor.raceDiscipline==='oval'){if(explicit)throw Error('venue_pit_review_unavailable');return null;}
 const usable=descriptor.pitUsableWidthMeters,policy=descriptor.pitPavementWidthPolicy;
 if(descriptor.raceDiscipline!=='circuit'||descriptor.routeExtent!=='mapped-venue-v1'||!Number.isFinite(usable)||usable<6||usable>30||!['mapped','usable-corridor'].includes(policy))throw Error('venue_pit_review_unavailable');
 const widths=policy==='mapped'?pit.wayIds.map(id=>parseMeters(layout.ways.get(id).tags.width)):[usable];
 if(widths.some(w=>!Number.isFinite(w)||w<usable||w>30))throw Error('venue_pit_width_unavailable');
 return {usableWidthMeters:usable,pavementWidthPolicy:policy,physicalWidthMeters:Math.max(...widths)};
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
function reviewedTerrainEdgePolicy(descriptor){
 const policy=descriptor.terrainEdgePolicy;if(policy===undefined)return undefined;
 if(policy!==REVIEWED_PAVEMENT_BOUNDARY_POLICY||descriptor.surfaceModel!=='banked-road-v1'||descriptor.routeExtent!=='mapped-venue-v1')throw Error('venue_terrain_edge_policy_invalid');
 return policy;
}
export function createRacingVenueGroundPlan(descriptor,source){
 reviewedTerrainEdgePolicy(descriptor);
 const layout=compileMappedVenueLayout(source),stage=reviewedStageLayout(layout,descriptor),pit=compileMappedVenuePitLayout(source,descriptor,layout),
  routes=stage?layout.wayIds.map(id=>layout.ways.get(id).geometry):[layout.points,...(pit?[pit.points]:[])],requiredArtifacts=racingVenueGroundRequirements(descriptor,{includeLandscape:true}),coverageProbes=[];
 if(layout.venueId!==descriptor.id||!(source.layout.usableWidthMeters>=(stage?3:6)&&source.layout.usableWidthMeters<=30))throw Error('venue_source_identity_mismatch');
 const physicalWidth=maximumPavementWidth(source,layout,descriptor,pit),extent=descriptor.pavementWidthPolicy==='profiled'?Math.max(...[...layout.wayIds,...(pit?.wayIds||[])].flatMap(id=>reviewedVenuePavementSections(source,descriptor,id).samples.map(s=>Math.max(s.positiveMeters,s.negativeMeters)))):physicalWidth*.5;
 const halfWidth=extent+(descriptor.routeExtent==='mapped-venue-v1'?REVIEWED_CORRIDOR_OUTER_MARGIN_METERS:2),landscape=reviewedLandscapeRefinement(descriptor),metersPerDegree=6371008.8*Math.PI/180;
 for(const points of routes)for(let index=1;index<points.length;index++){
  const a=points[index-1],b=points[index],length=geographicVenueDistance(a,b),steps=Math.max(1,Math.ceil(length/2));
  const east=(b.lon-a.lon)*Math.cos((a.lat+b.lat)*Math.PI/360)*metersPerDegree,north=(b.lat-a.lat)*metersPerDegree;
  const magnitude=Math.hypot(east,north);
  for(let step=0;step<=steps;step++){
   const t=step/steps,lat=a.lat+(b.lat-a.lat)*t,lon=a.lon+(b.lon-a.lon)*t;
   for(const lateral of [-halfWidth,0,halfWidth])coverageProbes.push(Object.freeze({latitude:lat+east/magnitude*lateral/metersPerDegree,
    longitude:lon-north/magnitude*lateral/(metersPerDegree*Math.cos(lat*Math.PI/180))}));
   if(coverageProbes.length>60000)throw Error('venue_ground_probe_bound');
  }
 }
 // The existing refinement also reaches around source caps and corners. Probe
 // their cardinal extents before starting a world, through the same ground owner.
 if(descriptor.routeExtent==='mapped-venue-v1')for(const points of routes)for(const point of points){
  for(const [east,north]of [[halfWidth,0],[-halfWidth,0],[0,halfWidth],[0,-halfWidth]])coverageProbes.push(Object.freeze({latitude:point.lat+north/metersPerDegree,longitude:point.lon+east/(metersPerDegree*Math.cos(point.lat*Math.PI/180))}));
  if(coverageProbes.length>60000)throw Error('venue_ground_probe_bound');
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
 const layout=compileMappedVenueLayout(source),stage=reviewedStageLayout(layout,descriptor),pit=compileMappedVenuePitLayout(source,descriptor,layout);
 if(layout.venueId!==descriptor.id||!(source.layout.usableWidthMeters>=(stage?3:6)&&source.layout.usableWidthMeters<=30))throw Error('venue_source_identity_mismatch');
 maximumPavementWidth(source,layout,descriptor);
 const startLine=reviewedStartLine(descriptor,layout),landscapeRefinement=reviewedLandscapeRefinement(descriptor),terrainEdgePolicy=reviewedTerrainEdgePolicy(descriptor);
 const circuitPit=reviewedCircuitPitWidth(source,layout,descriptor,pit);
 if(descriptor.routeExtent!==undefined&&descriptor.routeExtent!=='mapped-venue-v1')throw Error('venue_route_extent_invalid');
 if(descriptor.raceDiscipline!==undefined&&!['circuit','oval',...(stage?['rally']:[])].includes(descriptor.raceDiscipline))throw Error('venue_discipline_invalid');
 if(pit&&!circuitPit&&(!descriptor.routeExtent||descriptor.pavementWidthPolicy!=='profiled'||descriptor.raceDiscipline!=='oval'))throw Error('venue_pit_review_unavailable');
 const venueSource=descriptor.routeExtent?normalizeRaceVenueSource({version:stage?2:1,id:descriptor.id,sourceSha256:descriptor.sourceSha256,
  mappedLengthMeters:layout.lengthMeters,qualificationRadiusWorld:descriptor.qualificationRadiusWorld,sourceFeatureIds:layout.wayIds.map(id=>`osm:way:${id}`),...(stage?{stage:layout.stage}:{}),...(pit?{pitSourceFeatureIds:pit.sourceFeatureIds}:{})}):undefined;
 const edgeRecipes=authorVenueEdgeRecipes(layout,descriptor);
 const original=Array.isArray(data?.elements)?data.elements:[],existingNodes=new Map(original.filter(e=>e.type==='node').map(e=>[e.id,e]));
 const sourceWays=new Map(source.ways.map(w=>[w.id,w])),layoutWays=new Set(layout.wayIds),surveyWays=new Set([...layout.wayIds,...(pit?.wayIds||[])]),bounds=source.source?.coverage;
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
  const sections=surveyWays.has(raw.id)?reviewedVenuePavementSections(source,descriptor,raw.id):null;
  if(sections&&(deck||pavement))throw Error('venue_pavement_profile_conflict');
  const sourceFeatureId=`osm:way:${raw.id}`,way={type:'way',id:raw.id,version:raw.version,nodes:[...raw.nodes],tags:{...raw.tags,_sourceFeatureId:sourceFeatureId,_sourceCompleteness:'lossless',...(!surveyWays.has(raw.id)?{_regionalContext:'fixed-location'}:{})}};
  const widthReview=circuitPit&&!layoutWays.has(raw.id)?circuitPit:{usableWidthMeters:source.layout.usableWidthMeters,pavementWidthPolicy:descriptor.pavementWidthPolicy};
  if(surveyWays.has(raw.id))annotateRoadSourceSurvey(way,{version:1,venueId:descriptor.id,sourceFeatureId,...(venueSource?{venueSource}:{}),
   ...(stage?{sourceNodeIds:Object.freeze(raw.nodes.map(String))}:{}),
   ...(['mapped','profiled'].includes(widthReview.pavementWidthPolicy)?{pavementWidthPolicy:widthReview.pavementWidthPolicy}:{}),
   ...(sections?{sourcePavementSections:sections}:{}),
   usableWidthMeters:widthReview.usableWidthMeters,maximumCrossfall:layoutWays.has(raw.id)?descriptor.maximumCrossfall:.15,
   ...(descriptor.surfaceModel?{surfaceModel:descriptor.surfaceModel}:{}),
   ...(terrainEdgePolicy?{terrainEdgePolicy}:{}),
   ...(descriptor.motorAccess?{motorAccess:descriptor.motorAccess}:{}),
   ...(deck?{geographicDeckProfile:deck}:{}),
   ...(pavement?{geographicPavementProfile:pavement}:{}),
   ...(!deck&&!pavement&&edgeRecipes.has(raw.id)?{edgeBandRecipe:edgeRecipes.get(raw.id)}:{}),
   groundArtifactId:descriptor.groundArtifactId,groundContentSha256:descriptor.groundContentSha256,groundArtifacts:required});
  elements.set(`way:${raw.id}`,way);
 }
 const landscapeWays=mergeReviewedVenueLandscape(elements,descriptor,source);
 return {data:{...data,elements:[...elements.values()]},metadata:Object.freeze({landscapeWays,id:descriptor.id,name:descriptor.name,status:'source-prepared',
  ...(startLine?{startLine,layoutLabel:descriptor.layoutLabel||'Circuit'}:{}),
  ...(stage?{layoutLabel:descriptor.layoutLabel||'Stage'}:{}),
  ...(descriptor.presentationStatus?{presentationStatus:descriptor.presentationStatus}:{}),
  ...(descriptor.raceDiscipline?{raceDiscipline:descriptor.raceDiscipline}:{}),
  ...(pit?{pitSourceFeatureIds:pit.sourceFeatureIds,pitLayoutWayIds:pit.wayIds,pitMappedLengthMeters:pit.lengthMeters}:{}),
  ...(landscapeRefinement?{landscapeRefinement}:{}),
  ...(terrainEdgePolicy?{terrainEdgePolicy}:{}),
  ...(descriptor.landscapeGroundArtifacts?{landscapeGroundArtifacts:descriptor.landscapeGroundArtifacts}:{}),
  ...(venueSource?{venueSource}:{}),...(descriptor.raceAdmission?{raceAdmission:descriptor.raceAdmission}:{}),sourceSha256:descriptor.sourceSha256,sourceDate:source.source.osmBase||source.source.observedAt,layoutWayIds:Object.freeze([...layout.wayIds]),
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
 if(descriptor.reviewedLandscape){
  const cover=descriptor.reviewedLandscape;
  if(typeof cover.url!=='string'||!/^\/app\/assets\/racing\/[A-Za-z0-9_/-]+\.json$/.test(cover.url)||!/^[a-f0-9]{64}$/.test(cover.contentSha256))throw Error('venue_landscape_descriptor_invalid');
  const response=await fetchImpl(cover.url,{signal});if(!response.ok)throw Error('venue_landscape_fetch_failed');const coverText=await response.text();
  if(coverText.length>1000000||await sha256Text(coverText)!==cover.contentSha256)throw Error('venue_landscape_integrity_failed');
  if(signal?.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');
  annotateReviewedVenueLandscape(source,descriptor,JSON.parse(coverText));
 }

 if(profile){
  if(typeof profile.url!=='string'||!/^\/app\/assets\/racing\/[A-Za-z0-9_/-]+\.json$/.test(profile.url)||!/^[a-f0-9]{64}$/.test(profile.contentSha256))throw Error('venue_deck_descriptor_invalid');
  const response=await fetchImpl(profile.url,{signal});if(!response.ok)throw Error('venue_deck_source_fetch_failed');
  const bytes=await response.text();
  if(signal?.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');
  if(bytes.length>1024*1024||await sha256Text(bytes)!==profile.contentSha256)throw Error('venue_deck_source_integrity_failed');
  if(signal?.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');
  annotateReviewedVenueDecks(source,JSON.parse(bytes),{descriptor,requiredArtifacts:racingVenueGroundRequirements(descriptor),contentSha256:profile.contentSha256});
 }
 const sections=descriptor.reviewedPavementSections;
 if(sections){
  if(typeof sections.url!=='string'||!/^\/app\/assets\/racing\/[A-Za-z0-9_/-]+\.json$/.test(sections.url)||!/^[a-f0-9]{64}$/.test(sections.contentSha256))throw Error('venue_pavement_descriptor_invalid');
  const response=await fetchImpl(sections.url,{signal});if(!response.ok)throw Error('venue_pavement_source_fetch_failed');
  const bytes=await response.text();
  if(signal?.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');
  if(bytes.length>1024*1024||await sha256Text(bytes)!==sections.contentSha256)throw Error('venue_pavement_source_integrity_failed');
  if(signal?.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');
  annotateReviewedVenuePavementSections(source,JSON.parse(bytes),{descriptor,requiredArtifacts:racingVenueGroundRequirements(descriptor),contentSha256:sections.contentSha256});
 }
 return source;
}
