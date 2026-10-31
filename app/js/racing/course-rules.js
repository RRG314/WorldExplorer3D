import {racePavementCrossSection} from './pavement-cross-section.js';
import {RACE_CONTACT_RULES,normalizeRaceEventRules} from './event-rules.js';
import {OVAL_FORMATION_DISTANCE_METERS} from './oval-rules.js';
import {prepareRallyRoute,RALLY_MAXIMUM_FLIGHT_HEIGHT_METERS} from './rally-rules.js';
// Portable race-course facts and rules. The world compiler supplies road facts;
// this module cannot invent pavement, change a building or move a transport.
import {ROAD_SOURCE_MINIMUM_SPAN_METERS} from '../world/road-units.js';
import {BANKED_ROAD_MODEL,PROFILED_ROAD_PAVEMENT_MODEL,BANKED_ROAD_MAXIMUM_CROSSFALL,AUTHORED_ROAD_EDGE_MODEL,AUTHORED_ROAD_EDGE_MAXIMUM_LIFT_METERS,AUTHORED_ROAD_EDGE_MAXIMUM_CROSSFALL,AUTHORED_ROAD_EDGE_MAXIMUM_GRADE,AUTHORED_ROAD_EDGE_MAXIMUM_GRADIENT,AUTHORED_ROAD_EDGE_PUBLICATION_EPSILON_METERS} from '../physics/road-plane-dynamics.js';
import {normalizeRaceVenueSource,assertRaceVenueRoads,raceVenueMaximumLength,raceVenueMinimumWidth} from './venue-course-policy.js';
export const RACE_COURSE_VERSION=1;
export const RACE_MAX_ROUTE_EDGES=2048;
// Keep source-node topology down to centimetres, above the approved snapshot's
// millimetre coordinate precision. Work is bounded by counts and route length,
// not by dropping a short link from an otherwise connected real layout.
export const RACE_MINIMUM_SPAN_METERS=ROAD_SOURCE_MINIMUM_SPAN_METERS;
export const RACE_DISCIPLINES=Object.freeze(['sprint','circuit','time-trial','oval','rally']);
export const isClosedRaceDiscipline=discipline=>discipline==='circuit'||discipline==='oval';
const finitePoint=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const distance=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a.x*b.x+a.z*b.z)));
const direction=(a,b)=>{const n=distance(a,b);return {x:(b.x-a.x)/n,z:(b.z-a.z)/n};};
const clean=s=>String(s||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80);

// Course geometry belongs to its existing course/session. The weak index is a
// disposable query accelerator over immutable facts, never a second road or
// height authority. Mutable diagnostic fixtures retain the exhaustive path.
const spatialIndexes=new WeakMap();
export function prepareRaceCourseGeometry(course){
 if(course.rally){
  for(const key of ['splits','paceNotes']){course.rally[key].forEach(Object.freeze);Object.freeze(course.rally[key]);}
  Object.freeze(course.rally.segmentSurfaces);Object.freeze(course.rally);
 }
 if(course.pitLane){prepareRaceCourseGeometry(course.pitLane.course);Object.freeze(course.pitLane);}
 for(const segment of course.segments){
  Object.freeze(segment.a);Object.freeze(segment.b);Object.freeze(segment.forward);
  if(segment.heightSampleRange)Object.freeze(segment.heightSampleRange);
  if(segment.heightSamples){for(const sample of segment.heightSamples){
    if(sample.lateralSamples){sample.lateralSamples.forEach(Object.freeze);Object.freeze(sample.lateralSamples);}
    Object.freeze(sample);
   }Object.freeze(segment.heightSamples);}
  Object.freeze(segment);
 }
 Object.freeze(course.segments);
 return course;
}
function raceSpatialIndex(segments){
 if(segments.length<32||!Object.isFrozen(segments))return null;
 let tree=spatialIndexes.get(segments);if(tree)return tree;
 if(segments.some(s=>!Object.isFrozen(s)||!Object.isFrozen(s.a)||!Object.isFrozen(s.b)))return null;
 function build(indices){
  let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity,minMeters=Infinity,maxMeters=-Infinity;
  for(const index of indices){const s=segments[index];
   minX=Math.min(minX,s.a.x,s.b.x);minZ=Math.min(minZ,s.a.z,s.b.z);
   maxX=Math.max(maxX,s.a.x,s.b.x);maxZ=Math.max(maxZ,s.a.z,s.b.z);
   minMeters=Math.min(minMeters,s.startMeters);maxMeters=Math.max(maxMeters,s.startMeters+s.lengthMeters);
  }
  const node={minX,minZ,maxX,maxZ,minMeters,maxMeters};
  if(indices.length<=6){node.indices=indices.sort((a,b)=>a-b);return node;}
  const axis=maxX-minX>=maxZ-minZ?'x':'z';
  indices.sort((a,b)=>segments[a].a[axis]+segments[a].b[axis]-segments[b].a[axis]-segments[b].b[axis]||a-b);
  const middle=indices.length>>1;node.left=build(indices.slice(0,middle));node.right=build(indices.slice(middle));return node;
 }
 tree=build(segments.map((_,index)=>index));spatialIndexes.set(segments,tree);return tree;
}

export function raceSegmentAtDistance(course,distanceMeters){
 const segments=course.segments;let low=0,high=segments.length-1;
 while(low<high){const middle=(low+high)>>1,s=segments[middle];if(s.startMeters+s.lengthMeters>=distanceMeters)high=middle;else low=middle+1;}
 return segments[low];
}

function copyHeightSample(sample){return {...sample,...(sample.lateralSamples?{lateralSamples:sample.lateralSamples.map(p=>({...p}))}:{})};}
function lateralHeight(samples,offset){
 let lower=samples[0],upper=samples.at(-1);
 if(offset<=lower.offsetMeters)upper=samples[1];
 else if(offset>=upper.offsetMeters)lower=samples.at(-2);
 else for(let i=1;i<samples.length;i++)if(samples[i].offsetMeters>=offset){lower=samples[i-1];upper=samples[i];break;}
 return lower.y+(upper.y-lower.y)*(offset-lower.offsetMeters)/(upper.offsetMeters-lower.offsetMeters);
}
function lateralPatchHeight(lower,upper,u,offset){
 let index=1;
 for(let i=1;i<lower.length;i++){
  const left=lower[i-1].offsetMeters+(upper[i-1].offsetMeters-lower[i-1].offsetMeters)*u,
    right=lower[i].offsetMeters+(upper[i].offsetMeters-lower[i].offsetMeters)*u;
  if(right-left<=1e-10)continue;
  index=i;if(offset<=right)break;
 }
 const a=lower[index-1],b=lower[index],c=upper[index-1],d=upper[index],lowWidth=b.offsetMeters-a.offsetMeters,highWidth=d.offsetMeters-c.offsetMeters,
  diagonal=b.offsetMeters+(c.offsetMeters-b.offsetMeters)*u;
 // Same upward road-grid diagonal in either route direction. Collapsed ramp
 // knots at an entry/exit contribute one triangle rather than a vertical spike.
 if((offset<=diagonal&&lowWidth>1e-10)||highWidth<=1e-10){
  const v=(offset-a.offsetMeters-(c.offsetMeters-a.offsetMeters)*u)/lowWidth;
  return a.y*(1-u-v)+b.y*v+c.y*u;
 }
 const v=(offset-b.offsetMeters-(c.offsetMeters-b.offsetMeters)*u)/highWidth;
 return b.y*(1-u)+c.y*(u-v)+d.y*v;
}
function validLateralHeights(heights,width,metersPerUnit,span,length,maximumGrade,model,maximumCrossfall=BANKED_ROAD_MAXIMUM_CROSSFALL,maximumPlaneGradient=Infinity,profiled=false){
 if(!heights.some(s=>s.lateralSamples!==undefined))return true;
 if(model!==BANKED_ROAD_MODEL||width>30)return false;
 let previous=null;
 for(const station of heights){
  const points=station.lateralSamples;
  if(!Array.isArray(points)||points.length<3||points.length>32||points.some((p,i)=>!p||!Number.isFinite(p.offsetMeters)||!Number.isFinite(p.y)||
    i>0&&(p.offsetMeters<points[i-1].offsetMeters||
      (p.offsetMeters===points[i-1].offsetMeters?Math.abs(p.y-points[i-1].y)*metersPerUnit>1e-7:
       Math.abs(p.y-points[i-1].y)*metersPerUnit/(p.offsetMeters-points[i-1].offsetMeters)>maximumCrossfall+1e-8)))||
    (profiled?(points[0].offsetMeters> -span||points.at(-1).offsetMeters<span||points.at(-1).offsetMeters-points[0].offsetMeters>30||Math.max(Math.abs(points[0].offsetMeters),Math.abs(points.at(-1).offsetMeters))>30):(Math.abs(points[0].offsetMeters+width/2)>.001||Math.abs(points.at(-1).offsetMeters-width/2)>.001))||
    !points.some(p=>p.offsetMeters===0&&Math.abs(p.y-station.y)*metersPerUnit<=.001)||
    !Number.isFinite(station.leftY)||!Number.isFinite(station.rightY)||
    Math.abs(lateralHeight(points,-span)-station.leftY)*metersPerUnit>.001||Math.abs(lateralHeight(points,span)-station.rightY)*metersPerUnit>.001)return false;
  if(previous){
   if(points.length!==previous.lateralSamples.length)return false;
   const run=(station.t-previous.t)*length;
   for(let i=1;i<points.length;i++){
    const a=previous.lateralSamples[i-1],b=previous.lateralSamples[i],c=points[i-1],d=points[i];
    for(const [left,right,other]of[[a,b,c],[c,d,b]]){
     const delta=right.offsetMeters-left.offsetMeters;if(delta<=1e-10)continue;
     const lateral=(right.y-left.y)*metersPerUnit/delta,
      along=((other.y-left.y)*metersPerUnit-lateral*(other.offsetMeters-left.offsetMeters))/run;
     if(!Number.isFinite(along)||Math.abs(along)>maximumGrade+1e-8||Math.hypot(lateral,along)>maximumPlaneGradient+1e-8)return false;
    }
   }
  }
  previous=station;
 }
 return true;
}
function validRoadLateralHeights(heights,width,metersPerUnit,span,length,maximumGrade,model,edgeBandModel,pavementModel){
 const profiled=pavementModel===PROFILED_ROAD_PAVEMENT_MODEL;
 const authored=edgeBandModel===AUTHORED_ROAD_EDGE_MODEL;
 if(!authored)return !heights.some(s=>Array.isArray(s.lateralSamples)&&s.lateralSamples.some(p=>p?.baseY!==undefined))&&validLateralHeights(heights,width,metersPerUnit,span,length,maximumGrade,model,undefined,undefined,profiled);
 const epsilon=AUTHORED_ROAD_EDGE_PUBLICATION_EPSILON_METERS;
 if(model!==BANKED_ROAD_MODEL||heights.some(s=>!Array.isArray(s.lateralSamples)||s.lateralSamples.some(p=>!p||!Number.isFinite(p.baseY)||!Number.isFinite(p.y)||
  (p.y-p.baseY)*metersPerUnit< -epsilon||(p.y-p.baseY)*metersPerUnit>AUTHORED_ROAD_EDGE_MAXIMUM_LIFT_METERS+epsilon||p.offsetMeters===0&&Math.abs(p.y-p.baseY)*metersPerUnit>epsilon)))return false;
 const channel=lift=>heights.map(s=>{
  const lateralSamples=s.lateralSamples.map(p=>({offsetMeters:p.offsetMeters,y:lift?p.y-p.baseY:p.baseY}));
  return {t:s.t,y:lateralHeight(lateralSamples,0),leftY:lateralHeight(lateralSamples,-span),rightY:lateralHeight(lateralSamples,span),lateralSamples};
 });
 return validLateralHeights(heights,width,metersPerUnit,span,length,maximumGrade+AUTHORED_ROAD_EDGE_MAXIMUM_GRADE,model,BANKED_ROAD_MAXIMUM_CROSSFALL+AUTHORED_ROAD_EDGE_MAXIMUM_CROSSFALL,Infinity,profiled)&&
  validLateralHeights(channel(false),width,metersPerUnit,span,length,maximumGrade,model,undefined,undefined,profiled)&&
  validLateralHeights(channel(true),width,metersPerUnit,span,length,AUTHORED_ROAD_EDGE_MAXIMUM_GRADE,model,AUTHORED_ROAD_EDGE_MAXIMUM_CROSSFALL,AUTHORED_ROAD_EDGE_MAXIMUM_GRADIENT,profiled);
}
export function sampleRaceSegmentY(segment,t,lateralMeters=0){
 const samples=segment.heightSamples;
 if(segment.heightSampleRange){const range=segment.heightSampleRange;t=range.start+(range.end-range.start)*Math.max(0,Math.min(1,t));}
 if(!samples?.length)return segment.a.y+(segment.b.y-segment.a.y)*t;
 let lower=samples[0],upper=samples.at(-1);
 for(let index=1;index<samples.length;index++)if(samples[index].t>=t){lower=samples[index-1];upper=samples[index];break;}
 const blend=Math.max(0,Math.min(1,(t-lower.t)/Math.max(1e-9,upper.t-lower.t))),y=lower.y+(upper.y-lower.y)*blend;
 if(lower.lateralSamples&&upper.lateralSamples)return lateralPatchHeight(lower.lateralSamples,upper.lateralSamples,blend,lateralMeters);
 const side=lateralMeters<0?'leftY':'rightY',edge=Number.isFinite(lower[side])&&Number.isFinite(upper[side])?lower[side]+(upper[side]-lower[side])*blend:y;
 return y+(edge-y)*Math.abs(lateralMeters)/Math.max(.1,segment.heightSampleSpanMeters||1.2);
}
function sliceHeights(segment,start,end){
 if(!segment.heightSamples?.length)return null;
 const at=t=>({t:(t-start)/(end-start),y:sampleRaceSegmentY(segment,t),leftY:sampleRaceSegmentY(segment,t,-segment.heightSampleSpanMeters),rightY:sampleRaceSegmentY(segment,t,segment.heightSampleSpanMeters)});
 return [at(start),...segment.heightSamples.filter(s=>s.t>start&&s.t<end).map(s=>({...copyHeightSample(s),t:(s.t-start)/(end-start)})),at(end)];
}

function sliceHeightFields(segment,start,end){
 if(!segment.heightSamples?.[0].lateralSamples)return {heightSamples:sliceHeights(segment,start,end)};
 // Keep the original triangle stations when timing splits a tapered band.
 // Resampling just its end cross-sections would discard diagonal creases.
 const range=segment.heightSampleRange||{start:0,end:1},span=range.end-range.start;
 return {heightSamples:segment.heightSamples.map(copyHeightSample),heightSampleRange:{start:range.start+span*start,end:range.start+span*end}};
}

// The graph is a bounded derived index of published source roads, not another
// geographic authority. Different vertical decks are never joined by XZ alone.
export function buildRaceRoadGraph(roads,{metersPerUnit=1,minimumWidth,maximumGrade=.22,venueSource,partialVenue=false}={}){
 if(!(metersPerUnit>0&&metersPerUnit<=10)||!Array.isArray(roads)||roads.length>50000)throw Error('invalid_race_road_source');
 const venue=normalizeRaceVenueSource(venueSource);assertRaceVenueRoads(roads,venue,{partial:partialVenue});
 const widthFloor=raceVenueMinimumWidth(venue);
 minimumWidth=minimumWidth??widthFloor;
 if(!Number.isFinite(minimumWidth)||minimumWidth<widthFloor)throw Error('invalid_race_minimum_width');
 const nodes=[],edges=[],outgoing=new Map(),buckets=new Map(),edgeIds=new Set();
 function node(point,layer){
  const gx=Math.round(point.x*2),gz=Math.round(point.z*2),key=`${gx}:${gz}:${layer}`;
  for(let x=gx-1;x<=gx+1;x++)for(let z=gz-1;z<=gz+1;z++)for(const id of buckets.get(`${x}:${z}:${layer}`)||[]){
   const n=nodes[id];if(distance(n,point)*metersPerUnit<=.55&&Math.abs(n.y-point.y)*metersPerUnit<=.35)return id;
  }
  const id=nodes.length;nodes.push({id,...point});if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);return id;
 }
 for(const road of roads){
  const profiled=road?.pavementModel===PROFILED_ROAD_PAVEMENT_MODEL;
  if(road?.pavementModel!==undefined&&!profiled)throw Error('invalid_race_surface_model');
  if(!profiled&&(road?.racingWidthMeters!==undefined||Array.isArray(road?.heightSamples)&&road.heightSamples.some(s=>s.racingOffsetMeters!==undefined||s.racingWidthMeters!==undefined)))throw Error('invalid_race_pavement_sections');
  if(profiled){
   const samples=road.heightSamples,variable=Array.isArray(samples)&&samples.some(s=>s.racingWidthMeters!==undefined);
   if(road.surfaceModel!==BANKED_ROAD_MODEL||!Number.isFinite(road.racingWidthMeters)||road.racingWidthMeters<6||road.racingWidthMeters>30||!Array.isArray(samples)||samples.some(s=>{
    const width=variable?s.racingWidthMeters:road.racingWidthMeters;
    return !Number.isFinite(width)||width<road.racingWidthMeters||width>30||!Number.isFinite(s.racingOffsetMeters)||!Array.isArray(s.lateralSamples)||s.lateralSamples.length<3||s.racingOffsetMeters-width/2<s.lateralSamples[0].offsetMeters||s.racingOffsetMeters+width/2>s.lateralSamples.at(-1).offsetMeters;
   }))throw Error('invalid_race_pavement_sections');
  }
  if(road?.surfaceModel!==undefined&&road.surfaceModel!==BANKED_ROAD_MODEL||road?.edgeBandModel!==undefined&&road.edgeBandModel!==AUTHORED_ROAD_EDGE_MODEL)throw Error('invalid_race_surface_model');
  if(road?.edgeBandModel!==undefined&&!road.heightSamples?.some(s=>s.lateralSamples))throw Error('invalid_race_road_heights');
  if(!road?.sourceId||!finitePoint(road.a)||!finitePoint(road.b)||road.driveable!==true||road.supported!==true)continue;
  const length=distance(road.a,road.b)*metersPerUnit,width=Number(road.widthMeters);
  if(length<RACE_MINIMUM_SPAN_METERS||!Number.isFinite(width)||width<minimumWidth||Math.abs(road.b.y-road.a.y)*metersPerUnit/length>maximumGrade)continue;
  if(road.blocked===true||(road.structure==='tunnel'&&!(road.clearanceMeters>=2.5)))continue;
  const from=node(road.a,String(road.a.connectionLayer||'road')),to=node(road.b,String(road.b.connectionLayer||'road'));
  if(from===to)continue;
  function add(a,b,reverse){
   const heights=road.heightSamples;
   if(heights&&(!Array.isArray(heights)||heights.length<2||heights.length>250||heights.some((s,i)=>!Number.isFinite(s.t)||!Number.isFinite(s.y)||s.t<0||s.t>1||i>0&&s.t<=heights[i-1].t)||heights[0].t!==0||heights.at(-1).t!==1))throw Error('invalid_race_road_heights');
   if(heights){
    const span=Number(road.heightSampleSpanMeters??1.2);
    if(!validRoadLateralHeights(heights,width,metersPerUnit,span,length,maximumGrade,road.surfaceModel,road.edgeBandModel,road.pavementModel)||!(span>=.2&&span<=4)||Math.abs(heights[0].y-road.a.y)>.001||Math.abs(heights.at(-1).y-road.b.y)>.001||heights.some((s,i)=>
      i>0&&Math.abs(s.y-heights[i-1].y)*metersPerUnit/((s.t-heights[i-1].t)*length)>maximumGrade ||
      (s.leftY!==undefined||s.rightY!==undefined)&&(!Number.isFinite(s.leftY)||!Number.isFinite(s.rightY)||Math.max(Math.abs(s.leftY-s.y),Math.abs(s.rightY-s.y))*metersPerUnit/span>
        (road.surfaceModel===BANKED_ROAD_MODEL?BANKED_ROAD_MAXIMUM_CROSSFALL:.15))))throw Error('invalid_race_road_heights');
   }
   const id=`${String(road.sourceId).slice(0,180)}:${reverse?'reverse':'forward'}`,edge={id,from:a,to:b,length,widthMeters:width,
    ...(profiled?{pavementModel:PROFILED_ROAD_PAVEMENT_MODEL,racingWidthMeters:road.racingWidthMeters}:{}),
    sourceId:String(road.sourceId).slice(0,180),structure:road.structure||'surface',clearanceMeters:Number(road.clearanceMeters)||0};
   if(heights){edge.heightSamples=reverse?heights.map(s=>({...copyHeightSample(s),t:1-s.t,leftY:s.rightY,rightY:s.leftY,...(profiled?{racingOffsetMeters:-s.racingOffsetMeters||0}:{}),
     ...(s.lateralSamples?{lateralSamples:s.lateralSamples.map(p=>({...p,offsetMeters:-p.offsetMeters||0})).reverse()}:{})})).reverse():heights.map(copyHeightSample);edge.heightSampleSpanMeters=Number(road.heightSampleSpanMeters)||1.2;}
   if(road.surfaceModel)edge.surfaceModel=road.surfaceModel;
   if(road.edgeBandModel)edge.edgeBandModel=road.edgeBandModel;
   if(edgeIds.has(id))throw Error('duplicate_race_road_identity');edgeIds.add(id);
   edges.push(edge);if(!outgoing.has(a))outgoing.set(a,[]);outgoing.get(a).push(edge);
  }
  if(road.direction!=='reverse')add(from,to,false);if(road.direction!=='forward')add(to,from,true);
 }
 return {version:RACE_COURSE_VERSION,metersPerUnit,...(venue?{venueSource:venue}:{}),nodes,edges,outgoing};
}

// Dijkstra with a small binary heap. Work is bounded by the published graph;
// no provider fetch or frame scheduler lives in a route search.
export function shortestRacePath(graph,start,finish,{excludedEdges=new Set()}={}){
 if(!graph.nodes[start]||!graph.nodes[finish]||start===finish)return [];
 const queue=[],cost=new Map([[start,0]]),previous=new Map();
 const push=(id,value)=>{let i=queue.length;queue.push({id,value});while(i){const p=(i-1)>>1;if(queue[p].value<=value)break;queue[i]=queue[p];i=p;}queue[i]={id,value};};
 const pop=()=>{const first=queue[0],last=queue.pop();if(queue.length){let i=0;while(true){let child=i*2+1;if(child>=queue.length)break;if(child+1<queue.length&&queue[child+1].value<queue[child].value)child++;if(queue[child].value>=last.value)break;queue[i]=queue[child];i=child;}queue[i]=last;}return first;};
 push(start,0);let visits=0;
 while(queue.length&&visits++<=graph.nodes.length*4){
  const current=pop();if(current.value!==cost.get(current.id))continue;if(current.id===finish)break;
  for(const edge of graph.outgoing.get(current.id)||[]){
   if(excludedEdges.has(edge.id))continue;
   const value=current.value+edge.length;
   if(value>=(cost.get(edge.to)??Infinity))continue;
   cost.set(edge.to,value);previous.set(edge.to,edge);push(edge.to,value);
  }
 }
 if(!previous.has(finish))throw Error('disconnected_race_route');
 const result=[];let at=finish;while(at!==start){const edge=previous.get(at);if(!edge||result.length>graph.nodes.length)throw Error('invalid_race_route');result.push(edge.id);at=edge.from;}
 return result.reverse();
}

export function createRaceCourse(graph,path,settings={}){
 const eventRules=normalizeRaceEventRules(settings.eventRules===undefined?RACE_CONTACT_RULES:settings.eventRules);
 // Source/path preparation must not silently expose an unfinished rally as a
 // sprint. Stage motion, staggered clocks and recovery are a separate contract.
 if(graph.venueSource?.stage&&!graph.venueSource.stage.rally)throw Error('race_stage_runtime_unavailable');
 if(!Array.isArray(path)||path.length<1||path.length>RACE_MAX_ROUTE_EDGES)throw Error('invalid_race_route');
 const byId=new Map(graph.edges.map(e=>[e.id,e])),edges=path.map(id=>byId.get(id));if(edges.some(e=>!e))throw Error('race_road_missing');
 const discipline=settings.discipline||'sprint';if(!RACE_DISCIPLINES.includes(discipline))throw Error('invalid_race_discipline');
 if(Boolean(graph.venueSource?.stage)!==(discipline==='rally'))throw Error('race_rally_source_required');
 if(discipline==='rally'&&(settings.startOffsetMeters!=null||settings.pitPath!==undefined||settings.laps!==undefined&&settings.laps!==1))throw Error('race_rally_settings_invalid');
 const rally=discipline==='rally'?prepareRallyRoute(graph.venueSource,edges):null;
 if(rally&&edges.some(e=>e.surfaceModel||e.pavementModel||e.edgeBandModel))throw Error('race_rally_surface_model_unavailable');
 const closed=edges.at(-1).to===edges[0].from;
 if(isClosedRaceDiscipline(discipline)&&!closed)throw Error('race_circuit_not_closed');
 if(!isClosedRaceDiscipline(discipline)&&closed)throw Error('race_sprint_is_closed');
 const laps=isClosedRaceDiscipline(discipline)?Math.floor(Number(settings.laps)||1):1;if(laps<1||laps>8)throw Error('invalid_race_laps');
 const points=[{...graph.nodes[edges[0].from]}],segments=[];let lengthMeters=0;
 for(let i=0;i<edges.length;i++){
  const edge=edges[i];if(i&&edges[i-1].to!==edge.from)throw Error('disconnected_race_route');
  const a=graph.nodes[edge.from],b=graph.nodes[edge.to],forward=direction(a,b);
  if(i){const previous=segments.at(-1);if(angle(previous.forward,forward)>Math.PI*.64)throw Error('race_turn_too_sharp');}
  segments.push({sourceId:edge.sourceId,a:{...a},b:{...b},forward,widthMeters:edge.widthMeters,lengthMeters:edge.length,startMeters:lengthMeters,structure:edge.structure,clearanceMeters:edge.clearanceMeters,
    ...(edge.edgeBandModel?{edgeBandModel:edge.edgeBandModel}:{}),
    ...(edge.pavementModel?{pavementModel:edge.pavementModel,racingWidthMeters:edge.racingWidthMeters}:{}),
    ...(edge.heightSamples?{heightSamples:edge.heightSamples.map(copyHeightSample),heightSampleSpanMeters:edge.heightSampleSpanMeters}:{})});
  points.push({...b});lengthMeters+=edge.length;
 }
 if(closed&&angle(segments.at(-1).forward,segments[0].forward)>Math.PI*.64)throw Error('race_turn_too_sharp');
 // An oval discipline needs a reviewed whole loop and an explicit bank lane.
 // Renaming an ordinary city loop must not invent banking or apron semantics.
 if(discipline==='oval'&&(!graph.venueSource||segments.some(s=>s.pavementModel!==PROFILED_ROAD_PAVEMENT_MODEL||s.heightSamples?.some(row=>!Number.isFinite(row.racingWidthMeters)))))throw Error('race_oval_pavement_required');
 if(lengthMeters<200||lengthMeters>raceVenueMaximumLength(graph.venueSource))throw Error('race_route_length');
 if(closed){
  // Put a circuit's timing/grid line within its selected straight, never on
  // the corner at the end of that way. A driver can then cross it naturally.
  const original=segments.shift(),offset=Number(settings.startOffsetMeters??original.lengthMeters*.5);
  if(!(offset>0&&offset<original.lengthMeters))throw Error('invalid_race_start');
  const t=offset/original.lengthMeters,midpoint={x:original.a.x+(original.b.x-original.a.x)*t,
    y:sampleRaceSegmentY(original,t),z:original.a.z+(original.b.z-original.a.z)*t};
  segments.unshift({...original,a:midpoint,lengthMeters:original.lengthMeters-offset,...sliceHeightFields(original,t,1)});
  segments.push({...original,b:midpoint,lengthMeters:offset,...sliceHeightFields(original,0,t)});
  let cursor=0;for(const segment of segments){segment.startMeters=cursor;cursor+=segment.lengthMeters;}
  points.splice(0,points.length,{...segments[0].a},...segments.map(segment=>({...segment.b})));
 }
 const participants=Math.max(1,Math.min(4,Math.floor(Number(settings.participants)||1)));
 const gridLength=rally?12:(Math.ceil(participants/2)-1)*8+12;
 let gridRun=0;
 for(const segment of segments){
  if(angle(segments[0].forward,segment.forward)>.12||segment.widthMeters<(rally?raceVenueMinimumWidth(graph.venueSource):6))break;
  gridRun+=segment.lengthMeters;if(gridRun>=gridLength)break;
 }
 if(gridRun<gridLength)throw Error('race_grid_has_no_clearance');
 const course={version:RACE_COURSE_VERSION,...(eventRules?{eventRules}:{}),...(graph.venueSource?{venueSource:graph.venueSource}:{}),sourcePath:[...path],startOffsetMeters:closed?Number(settings.startOffsetMeters??edges[0].length*.5):null,name:clean(settings.name)||'Mapped road run',description:String(settings.description||'').trim().slice(0,400),
  ...(edges.some(e=>e.surfaceModel===BANKED_ROAD_MODEL)?{surfaceModel:BANKED_ROAD_MODEL}:{}),
  ...(edges.some(e=>e.edgeBandModel===AUTHORED_ROAD_EDGE_MODEL)?{edgeBandModel:AUTHORED_ROAD_EDGE_MODEL}:{}),
  ...(edges.some(e=>e.pavementModel===PROFILED_ROAD_PAVEMENT_MODEL)?{pavementModel:PROFILED_ROAD_PAVEMENT_MODEL}:{}),
  locationId:clean(settings.locationId),locationLabel:clean(settings.locationLabel),anchor:settings.anchor?{lat:Number(settings.anchor.lat),lon:Number(settings.anchor.lon)}:null,
  discipline,laps,participants,...(rally?{rally}:{}),vehicleEnvelope:{widthMeters:2.35,lengthMeters:6.5,heightMeters:2.4},metersPerUnit:graph.metersPerUnit,vehicleClass:settings.vehicleClass||'road',traffic:'closed-course',collision:'ghost',
  lengthMeters,segments,points,gateSpacingMeters:Math.min(30,Math.max(15,Number(settings.gateSpacingMeters)||25)),gates:[]};
 const gateAt=(segment,t,distanceMeters)=>{
  const section=racePavementCrossSection(segment,t),offset=section?.racingOffsetMeters||0,f=segment.forward;
  return {x:segment.a.x+(segment.b.x-segment.a.x)*t+f.z*offset/course.metersPerUnit,y:sampleRaceSegmentY(segment,t,offset),z:segment.a.z+(segment.b.z-segment.a.z)*t-f.x*offset/course.metersPerUnit,
   forward:f,halfWidthMeters:section?section.racingWidthMeters*.5:segment.widthMeters*.5,distanceMeters};
 };
 let at=course.gateSpacingMeters;
 for(let index=0;index<segments.length;index++){
  const segment=segments[index],before=segments[index-1],after=segments[index+1];
  while(at<segment.startMeters+segment.lengthMeters-1e-6){const t=(at-segment.startMeters)/segment.lengthMeters;
   // A gate on a bend's tangent can already be behind a correctly turning car
   // before it becomes the next gate. Keep timing gates on supported straights.
   const nearStart=before&&angle(before.forward,segment.forward)>.15&&at-segment.startMeters<5;
   const nearEnd=after&&angle(segment.forward,after.forward)>.15&&segment.startMeters+segment.lengthMeters-at<5;
   if(nearStart||nearEnd){at+=course.gateSpacingMeters;continue;}
   course.gates.push(gateAt(segment,t,at));at+=course.gateSpacingMeters;
  }
 }
 const last=segments.at(-1);course.gates.push(last.pavementModel?gateAt(last,1,lengthMeters):{...last.b,forward:last.forward,halfWidthMeters:last.widthMeters*.5,distanceMeters:lengthMeters});
 if(rally){
  // Splits are real ordered timing planes, rather than a display cursor that
  // could count a skipped sector. Their source positions survive canonical IO.
  for(const [splitIndex,split]of rally.splits.entries()){
   const segment=raceSegmentAtDistance(course,split.distanceMeters),gate=gateAt(segment,(split.distanceMeters-segment.startMeters)/segment.lengthMeters,split.distanceMeters);
   course.gates=course.gates.filter(g=>Math.abs(g.distanceMeters-split.distanceMeters)>.01);
   course.gates.push({...gate,splitIndex});
  }
  course.gates.sort((a,b)=>a.distanceMeters-b.distanceMeters);
  rally.splits=rally.splits.map((split,index)=>({...split,gateIndex:course.gates.findIndex(g=>g.splitIndex===index)}));
  // Validate the longest admitted chassis swept through every bend. Checking
  // centreline width alone misses a long body's outside corners on hairpins.
  for(let i=1;i<segments.length;i++){
   const a=segments[i-1],b=segments[i],turn=angle(a.forward,b.forward),required=course.vehicleEnvelope.widthMeters+course.vehicleEnvelope.lengthMeters*Math.sin(turn/2)+.4;
   if(Math.min(a.widthMeters,b.widthMeters)<required)throw Error('race_rally_chassis_clearance');
  }
 }
 if(!course.locationId||!course.anchor||!Number.isFinite(course.anchor.lat)||Math.abs(course.anchor.lat)>85||!Number.isFinite(course.anchor.lon)||Math.abs(course.anchor.lon)>180)throw Error('invalid_race_location');
 if(settings.pitPath!==undefined){
  if(!isClosedRaceDiscipline(discipline)||!graph.venueSource?.pitSourceFeatureIds||!Array.isArray(settings.pitPath)||!settings.pitPath.length||settings.pitPath.length>512)throw Error('race_pit_source_required');
  const pitEdges=settings.pitPath.map(id=>byId.get(id)),allowed=new Set(graph.venueSource.pitSourceFeatureIds),mainSources=new Set(edges.map(e=>e.sourceId));
  if(pitEdges.some(e=>!e||![...allowed].some(id=>e.sourceId.startsWith(id+':'))||mainSources.has(e.sourceId))||new Set(settings.pitPath).size!==settings.pitPath.length)throw Error('race_invalid_pit_path');
  if(discipline==='oval'&&pitEdges.some(e=>e.pavementModel!==PROFILED_ROAD_PAVEMENT_MODEL||e.heightSamples?.some(row=>!Number.isFinite(row.racingWidthMeters))))throw Error('race_pit_pavement_required');
  const pit=createRaceCourse(graph,settings.pitPath,{locationId:course.locationId,locationLabel:course.locationLabel,anchor:course.anchor,discipline:'sprint',participants:1,name:course.name+' · pit lane',gateSpacingMeters:15});
  if(pit.lengthMeters>2000)throw Error('race_pit_length');
  const entryNode=pitEdges[0].from,exitNode=pitEdges.at(-1).to,mainNodes=new Set(edges.map(e=>e.from));
  if(entryNode===exitNode||!mainNodes.has(entryNode)||!mainNodes.has(exitNode)||pitEdges.slice(0,-1).some(e=>mainNodes.has(e.to)))throw Error('race_pit_join_invalid');
  const join=node=>{const matches=course.segments.filter(s=>s.a.id===node);if(matches.length!==1)throw Error('race_pit_join_invalid');return matches[0].startMeters;},
   entryDistanceMeters=join(entryNode),exitDistanceMeters=join(exitNode),replacedDistanceMeters=(exitDistanceMeters-entryDistanceMeters+course.lengthMeters)%course.lengthMeters;
  if(replacedDistanceMeters<50||replacedDistanceMeters>Math.min(3000,course.lengthMeters*.7))throw Error('race_pit_join_invalid');
  for(const [node,pitSegment,t]of [[entryNode,pit.segments[0],0],[exitNode,pit.segments.at(-1),1]]){
   const main=course.segments.find(s=>s.a.id===node);
   if(Math.abs(sampleRaceSegmentY(main,0,0)-sampleRaceSegmentY(pitSegment,t,0))*course.metersPerUnit>.01)throw Error('race_pit_join_height');
  }
  // This branch is reconstructed from approved road facts. Its source path is
  // part of the reference and class identity; caller-supplied meshes or poses
  // cannot describe an alternative timing route.
  course.pitPath=Object.freeze([...settings.pitPath]);course.pitLane={version:1,course:pit,entryDistanceMeters,exitDistanceMeters,replacedDistanceMeters};
 }
 return prepareRaceCourseGeometry(course);
}

export function projectRacePosition(course,pose,{minimumMeters=-Infinity,maximumMeters=Infinity,pavementPaddingMeters,flight=false}={}){
 if(flight&&course.discipline!=='rally')throw Error('invalid_race_flight_projection');
 if(pavementPaddingMeters!==undefined&&(!Number.isFinite(pavementPaddingMeters)||pavementPaddingMeters<0||pavementPaddingMeters>4))throw Error('invalid_race_projection_padding');
 let nearest=null;
 function sample(index){
  const s=course.segments[index],dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,l2=dx*dx+dz*dz;
  if(s.startMeters>maximumMeters||s.startMeters+s.lengthMeters<minimumMeters)return;
  const lower=Math.max(0,(minimumMeters-s.startMeters)/s.lengthMeters),upper=Math.min(1,(maximumMeters-s.startMeters)/s.lengthMeters);
  const t=Math.max(lower,Math.min(upper,((pose.x-s.a.x)*dx+(pose.z-s.a.z)*dz)/l2));
  const x=s.a.x+dx*t,z=s.a.z+dz*t,lateral=((pose.x-x)*s.forward.z-(pose.z-z)*s.forward.x)*course.metersPerUnit,y=sampleRaceSegmentY(s,t,lateral);
  const error=Math.hypot(pose.x-x,pose.z-z)*course.metersPerUnit,vertical=Math.abs(pose.y-y)*course.metersPerUnit;
  if(vertical>(flight?RALLY_MAXIMUM_FLIGHT_HEIGHT_METERS:2.5))return;
  if(nearest&&!(error<nearest.error||error===nearest.error&&index<nearest.index))return;
  const candidate={index,t,x,y,z,lateralMeters:lateral,error,vertical,distanceMeters:s.startMeters+s.lengthMeters*t,widthMeters:s.widthMeters,...(s.pavementModel?{pavement:racePavementCrossSection(s,t)}:{})};
  if(pavementPaddingMeters!==undefined&&raceProjectionOutsidePavement(candidate,-pavementPaddingMeters))return;
  nearest=candidate;
 }
 const tree=raceSpatialIndex(course.segments);
 if(!tree){for(let index=0;index<course.segments.length;index++)sample(index);return nearest;}
 const bound=node=>Math.hypot(Math.max(node.minX-pose.x,0,pose.x-node.maxX),Math.max(node.minZ-pose.z,0,pose.z-node.maxZ))*course.metersPerUnit;
 function visit(node,lower){
  if(node.minMeters>maximumMeters||node.maxMeters<minimumMeters||nearest&&lower>nearest.error+1e-9)return;
  if(node.indices){for(const index of node.indices)sample(index);return;}
  const left=bound(node.left),right=bound(node.right);
  if(left<=right){visit(node.left,left);visit(node.right,right);}else{visit(node.right,right);visit(node.left,left);}
 }
 visit(tree,bound(tree));
 return nearest;
}

export function raceGridPose(course,index=0,{rollingStagingMeters=course.discipline==='oval'?OVAL_FORMATION_DISTANCE_METERS:0}={}){
 if(!Number.isInteger(index)||index<0||index>=course.participants)throw Error('invalid_race_grid_slot');
 if(!Number.isFinite(rollingStagingMeters)||rollingStagingMeters<0||rollingStagingMeters>80||rollingStagingMeters&&course.discipline!=='oval')throw Error('invalid_race_rolling_grid');
 const gridDistance=course.vehicleEnvelope.lengthMeters/2+1+(course.discipline==='rally'?0:(Math.ceil(course.participants/2)-1-Math.floor(index/2))*8),
  distanceMeters=rollingStagingMeters?((gridDistance-rollingStagingMeters)%course.lengthMeters+course.lengthMeters)%course.lengthMeters:gridDistance;
 const s=raceSegmentAtDistance(course,distanceMeters);
 const forward=s.forward,along=(distanceMeters-s.startMeters)/course.metersPerUnit;
 const lateral=((racePavementCrossSection(s,(distanceMeters-s.startMeters)/s.lengthMeters)?.racingOffsetMeters||0)+(course.participants===1||course.discipline==='rally'?0:index%2===0?-1.4:1.4))/course.metersPerUnit;
 return {x:s.a.x+forward.x*along+forward.z*lateral,y:sampleRaceSegmentY(s,along*course.metersPerUnit/s.lengthMeters,lateral*course.metersPerUnit),
  z:s.a.z+forward.z*along-forward.x*lateral,yaw:Math.atan2(forward.x,forward.z)};
}

export function raceProjectionOutsidePavement(projection,padding=.5){
 if(!projection)return true;
 const p=projection.pavement;if(!p)return projection.error>projection.widthMeters*.5+padding;
 return projection.lateralMeters<p.minimumMeters-padding||projection.lateralMeters>p.maximumMeters+padding||
  Math.max(0,projection.error**2-projection.lateralMeters**2)>(Math.max(Math.abs(p.minimumMeters),Math.abs(p.maximumMeters))+padding)**2;
}

export function createRaceProgress(pose,nowMs){
 if(!finitePoint(pose)||!Number.isFinite(nowMs))throw Error('invalid_race_pose');
 return {nextGate:0,lap:1,finished:false,invalid:false,penaltyMs:0,lastPose:{...pose},lastAtMs:nowMs,lapStartedAtMs:nowMs,lapTimes:[],bestLapMs:null};
}
export function advanceRaceProgress(course,progress,pose,nowMs,{startedAtMs,maximumMetersPerSecond=85,flight=false}={}){
 if(progress.finished||progress.invalid)return progress;
 if(!Number.isFinite(startedAtMs)||!(maximumMetersPerSecond>0&&maximumMetersPerSecond<=150))throw Error('invalid_race_clock');
 if(!finitePoint(pose)||!Number.isFinite(nowMs)||!(nowMs>progress.lastAtMs))throw Error('invalid_race_pose');
 const elapsed=(nowMs-progress.lastAtMs)/1000,travel=distance(progress.lastPose,pose)*course.metersPerUnit;
 if(elapsed>10||travel>maximumMetersPerSecond*elapsed+1.5)throw Error('implausible_race_motion');
 const projection=projectRacePosition(course,pose,{flight});
 if(raceProjectionOutsidePavement(projection))throw Error('outside_race_course');
 const sweepSteps=Math.ceil(travel/2);
 if(sweepSteps>750)throw Error('implausible_race_motion');
 for(let step=1;step<sweepSteps;step++){
  const t=step/sweepSteps,from=progress.lastPose,sample=projectRacePosition(course,{x:from.x+(pose.x-from.x)*t,y:from.y+(pose.y-from.y)*t,z:from.z+(pose.z-from.z)*t},{flight});
  if(raceProjectionOutsidePavement(sample))throw Error('outside_race_course');
 }
 const next={...progress,lastPose:{...pose},lastAtMs:nowMs,lapTimes:[...progress.lapTimes]};
 if(nowMs<startedAtMs){if(travel>.3)throw Error('race_false_start');return next;}
 const from=progress.lastPose;
 for(let count=0;count<8&&!next.finished;count++){
  const gate=course.gates[next.nextGate];if(gate.pitUnavailable===true)break;const f=gate.forward;
  const a=(from.x-gate.x)*f.x+(from.z-gate.z)*f.z,b=(pose.x-gate.x)*f.x+(pose.z-gate.z)*f.z;
  if(!(a<=0&&b>0))break;
  const t=-a/(b-a),x=from.x+(pose.x-from.x)*t,z=from.z+(pose.z-from.z)*t,y=from.y+(pose.y-from.y)*t;
  const lateral=((x-gate.x)*f.z-(z-gate.z)*f.x)*course.metersPerUnit;
  let gateY=gate.y;
  if(course.pavementModel){const segment=raceSegmentAtDistance(course,gate.distanceMeters),station=(gate.distanceMeters-segment.startMeters)/segment.lengthMeters,section=racePavementCrossSection(segment,station);if(section)gateY=sampleRaceSegmentY(segment,station,section.racingOffsetMeters+lateral);}
  if(Math.abs(lateral)>gate.halfWidthMeters||Math.abs(y-gateY)*course.metersPerUnit>(flight&&course.discipline==='rally'?RALLY_MAXIMUM_FLIGHT_HEIGHT_METERS:2))break;
  const crossedAt=progress.lastAtMs+(nowMs-progress.lastAtMs)*t;
  next.nextGate++;
  if(next.nextGate===course.gates.length){
   const lapMs=Math.max(1,crossedAt-Math.max(startedAtMs,next.lapStartedAtMs));next.lapTimes.push(lapMs);next.bestLapMs=Math.min(next.bestLapMs??Infinity,lapMs);
   if(next.lap===course.laps){next.finished=true;next.finishAtMs=crossedAt;next.elapsedMs=crossedAt-startedAtMs+next.penaltyMs;}
   else{next.lap++;next.nextGate=0;next.lapStartedAtMs=crossedAt;}
  }
 }
 return next;
}
