// Portable race-course facts and rules. The world compiler supplies road facts;
// this module cannot invent pavement, change a building or move a transport.
export const RACE_COURSE_VERSION=1;
export const RACE_DISCIPLINES=Object.freeze(['sprint','circuit','time-trial']);
const finitePoint=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const distance=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a.x*b.x+a.z*b.z)));
const direction=(a,b)=>{const n=distance(a,b);return {x:(b.x-a.x)/n,z:(b.z-a.z)/n};};
const clean=s=>String(s||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80);

export function sampleRaceSegmentY(segment,t,lateralMeters=0){
 const samples=segment.heightSamples;
 if(!samples?.length)return segment.a.y+(segment.b.y-segment.a.y)*t;
 let lower=samples[0],upper=samples.at(-1);
 for(let index=1;index<samples.length;index++)if(samples[index].t>=t){lower=samples[index-1];upper=samples[index];break;}
 const blend=Math.max(0,Math.min(1,(t-lower.t)/Math.max(1e-9,upper.t-lower.t))),y=lower.y+(upper.y-lower.y)*blend;
 const side=lateralMeters<0?'leftY':'rightY',edge=Number.isFinite(lower[side])&&Number.isFinite(upper[side])?lower[side]+(upper[side]-lower[side])*blend:y;
 return y+(edge-y)*Math.abs(lateralMeters)/Math.max(.1,segment.heightSampleSpanMeters||1.2);
}
function sliceHeights(segment,start,end){
 if(!segment.heightSamples?.length)return null;
 const at=t=>({t:(t-start)/(end-start),y:sampleRaceSegmentY(segment,t),leftY:sampleRaceSegmentY(segment,t,-segment.heightSampleSpanMeters),rightY:sampleRaceSegmentY(segment,t,segment.heightSampleSpanMeters)});
 return [at(start),...segment.heightSamples.filter(s=>s.t>start&&s.t<end).map(s=>({...s,t:(s.t-start)/(end-start)})),at(end)];
}

// The graph is a bounded derived index of published source roads, not another
// geographic authority. Different vertical decks are never joined by XZ alone.
export function buildRaceRoadGraph(roads,{metersPerUnit=1,minimumWidth=6,maximumGrade=.22}={}){
 if(!(metersPerUnit>0&&metersPerUnit<=10)||!Array.isArray(roads)||roads.length>50000)throw Error('invalid_race_road_source');
 const nodes=[],edges=[],outgoing=new Map(),buckets=new Map(),edgeIds=new Set();
 function node(point,layer){
  const gx=Math.round(point.x*2),gz=Math.round(point.z*2),key=`${gx}:${gz}:${layer}`;
  for(let x=gx-1;x<=gx+1;x++)for(let z=gz-1;z<=gz+1;z++)for(const id of buckets.get(`${x}:${z}:${layer}`)||[]){
   const n=nodes[id];if(distance(n,point)*metersPerUnit<=.55&&Math.abs(n.y-point.y)*metersPerUnit<=.35)return id;
  }
  const id=nodes.length;nodes.push({id,...point});if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);return id;
 }
 for(const road of roads){
  if(!road?.sourceId||!finitePoint(road.a)||!finitePoint(road.b)||road.driveable!==true||road.supported!==true)continue;
  const length=distance(road.a,road.b)*metersPerUnit,width=Number(road.widthMeters);
  if(length<2||!Number.isFinite(width)||width<minimumWidth||Math.abs(road.b.y-road.a.y)*metersPerUnit/length>maximumGrade)continue;
  if(road.blocked===true||(road.structure==='tunnel'&&!(road.clearanceMeters>=2.5)))continue;
  const from=node(road.a,String(road.a.connectionLayer||'road')),to=node(road.b,String(road.b.connectionLayer||'road'));
  function add(a,b,reverse){
   const heights=road.heightSamples;
   if(heights&&(!Array.isArray(heights)||heights.length<2||heights.length>250||heights.some((s,i)=>!Number.isFinite(s.t)||!Number.isFinite(s.y)||s.t<0||s.t>1||i>0&&s.t<=heights[i-1].t)||heights[0].t!==0||heights.at(-1).t!==1))throw Error('invalid_race_road_heights');
   if(heights){
    const span=Number(road.heightSampleSpanMeters??1.2);
    if(!(span>=.2&&span<=4)||Math.abs(heights[0].y-road.a.y)>.001||Math.abs(heights.at(-1).y-road.b.y)>.001||heights.some((s,i)=>
      i>0&&Math.abs(s.y-heights[i-1].y)*metersPerUnit/((s.t-heights[i-1].t)*length)>maximumGrade ||
      (s.leftY!==undefined||s.rightY!==undefined)&&(!Number.isFinite(s.leftY)||!Number.isFinite(s.rightY)||Math.max(Math.abs(s.leftY-s.y),Math.abs(s.rightY-s.y))*metersPerUnit/span>.15)))throw Error('invalid_race_road_heights');
   }
   const id=`${String(road.sourceId).slice(0,180)}:${reverse?'reverse':'forward'}`,edge={id,from:a,to:b,length,widthMeters:width,
    sourceId:String(road.sourceId).slice(0,180),structure:road.structure||'surface',clearanceMeters:Number(road.clearanceMeters)||0};
   if(heights){edge.heightSamples=reverse?heights.map(s=>({...s,t:1-s.t,leftY:s.rightY,rightY:s.leftY})).reverse():heights.map(s=>({...s}));edge.heightSampleSpanMeters=Number(road.heightSampleSpanMeters)||1.2;}
   if(edgeIds.has(id))throw Error('duplicate_race_road_identity');edgeIds.add(id);
   edges.push(edge);if(!outgoing.has(a))outgoing.set(a,[]);outgoing.get(a).push(edge);
  }
  if(road.direction!=='reverse')add(from,to,false);if(road.direction!=='forward')add(to,from,true);
 }
 return {version:RACE_COURSE_VERSION,metersPerUnit,nodes,edges,outgoing};
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
 if(!Array.isArray(path)||path.length<1||path.length>500)throw Error('invalid_race_route');
 const byId=new Map(graph.edges.map(e=>[e.id,e])),edges=path.map(id=>byId.get(id));if(edges.some(e=>!e))throw Error('race_road_missing');
 const discipline=settings.discipline||'sprint';if(!RACE_DISCIPLINES.includes(discipline))throw Error('invalid_race_discipline');
 const closed=edges.at(-1).to===edges[0].from;
 if(discipline==='circuit'&&!closed)throw Error('race_circuit_not_closed');
 if(discipline!=='circuit'&&closed)throw Error('race_sprint_is_closed');
 const laps=discipline==='circuit'?Math.floor(Number(settings.laps)||1):1;if(laps<1||laps>8)throw Error('invalid_race_laps');
 const points=[{...graph.nodes[edges[0].from]}],segments=[];let lengthMeters=0;
 for(let i=0;i<edges.length;i++){
  const edge=edges[i];if(i&&edges[i-1].to!==edge.from)throw Error('disconnected_race_route');
  const a=graph.nodes[edge.from],b=graph.nodes[edge.to],forward=direction(a,b);
  if(i){const previous=segments.at(-1);if(angle(previous.forward,forward)>Math.PI*.64)throw Error('race_turn_too_sharp');}
  segments.push({sourceId:edge.sourceId,a:{...a},b:{...b},forward,widthMeters:edge.widthMeters,lengthMeters:edge.length,startMeters:lengthMeters,structure:edge.structure,clearanceMeters:edge.clearanceMeters,
    ...(edge.heightSamples?{heightSamples:edge.heightSamples.map(s=>({...s})),heightSampleSpanMeters:edge.heightSampleSpanMeters}:{})});
  points.push({...b});lengthMeters+=edge.length;
 }
 if(closed&&angle(segments.at(-1).forward,segments[0].forward)>Math.PI*.64)throw Error('race_turn_too_sharp');
 if(lengthMeters<200||lengthMeters>8000)throw Error('race_route_length');
 if(closed){
  // Put a circuit's timing/grid line within its selected straight, never on
  // the corner at the end of that way. A driver can then cross it naturally.
  const original=segments.shift(),offset=Number(settings.startOffsetMeters??original.lengthMeters*.5);
  if(!(offset>0&&offset<original.lengthMeters))throw Error('invalid_race_start');
  const t=offset/original.lengthMeters,midpoint={x:original.a.x+(original.b.x-original.a.x)*t,
    y:sampleRaceSegmentY(original,t),z:original.a.z+(original.b.z-original.a.z)*t};
  segments.unshift({...original,a:midpoint,lengthMeters:original.lengthMeters-offset,heightSamples:sliceHeights(original,t,1)});
  segments.push({...original,b:midpoint,lengthMeters:offset,heightSamples:sliceHeights(original,0,t)});
  let cursor=0;for(const segment of segments){segment.startMeters=cursor;cursor+=segment.lengthMeters;}
  points.splice(0,points.length,{...segments[0].a},...segments.map(segment=>({...segment.b})));
 }
 const participants=Math.max(1,Math.min(4,Math.floor(Number(settings.participants)||1)));
 const gridLength=(Math.ceil(participants/2)-1)*8+12;
 let gridRun=0;
 for(const segment of segments){
  if(angle(segments[0].forward,segment.forward)>.12||segment.widthMeters<6)break;
  gridRun+=segment.lengthMeters;if(gridRun>=gridLength)break;
 }
 if(gridRun<gridLength)throw Error('race_grid_has_no_clearance');
 const course={version:RACE_COURSE_VERSION,sourcePath:[...path],startOffsetMeters:closed?Number(settings.startOffsetMeters??edges[0].length*.5):null,name:clean(settings.name)||'Mapped road run',description:String(settings.description||'').trim().slice(0,400),
  locationId:clean(settings.locationId),locationLabel:clean(settings.locationLabel),anchor:settings.anchor?{lat:Number(settings.anchor.lat),lon:Number(settings.anchor.lon)}:null,
  discipline,laps,participants,vehicleEnvelope:{widthMeters:2.35,lengthMeters:6.5,heightMeters:2.4},metersPerUnit:graph.metersPerUnit,vehicleClass:settings.vehicleClass||'road',traffic:'closed-course',collision:'ghost',
  lengthMeters,segments,points,gateSpacingMeters:Math.min(30,Math.max(15,Number(settings.gateSpacingMeters)||25)),gates:[]};
 let at=course.gateSpacingMeters;
 for(let index=0;index<segments.length;index++){
  const segment=segments[index],before=segments[index-1],after=segments[index+1];
  while(at<segment.startMeters+segment.lengthMeters-1e-6){const t=(at-segment.startMeters)/segment.lengthMeters;
   // A gate on a bend's tangent can already be behind a correctly turning car
   // before it becomes the next gate. Keep timing gates on supported straights.
   const nearStart=before&&angle(before.forward,segment.forward)>.15&&at-segment.startMeters<5;
   const nearEnd=after&&angle(segment.forward,after.forward)>.15&&segment.startMeters+segment.lengthMeters-at<5;
   if(nearStart||nearEnd){at+=course.gateSpacingMeters;continue;}
   course.gates.push({x:segment.a.x+(segment.b.x-segment.a.x)*t,y:sampleRaceSegmentY(segment,t),z:segment.a.z+(segment.b.z-segment.a.z)*t,
    forward:segment.forward,halfWidthMeters:segment.widthMeters*.5,distanceMeters:at});at+=course.gateSpacingMeters;
  }
 }
 const last=segments.at(-1);course.gates.push({...last.b,forward:last.forward,halfWidthMeters:last.widthMeters*.5,distanceMeters:lengthMeters});
 if(!course.locationId||!course.anchor||!Number.isFinite(course.anchor.lat)||Math.abs(course.anchor.lat)>85||!Number.isFinite(course.anchor.lon)||Math.abs(course.anchor.lon)>180)throw Error('invalid_race_location');
 return course;
}

export function projectRacePosition(course,pose,{minimumMeters=-Infinity,maximumMeters=Infinity}={}){
 let nearest=null;
 for(let index=0;index<course.segments.length;index++){
  const s=course.segments[index],dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,l2=dx*dx+dz*dz;
  if(s.startMeters>maximumMeters||s.startMeters+s.lengthMeters<minimumMeters)continue;
  const lower=Math.max(0,(minimumMeters-s.startMeters)/s.lengthMeters),upper=Math.min(1,(maximumMeters-s.startMeters)/s.lengthMeters);
  const t=Math.max(lower,Math.min(upper,((pose.x-s.a.x)*dx+(pose.z-s.a.z)*dz)/l2));
  const x=s.a.x+dx*t,z=s.a.z+dz*t,lateral=((pose.x-x)*s.forward.z-(pose.z-z)*s.forward.x)*course.metersPerUnit,y=sampleRaceSegmentY(s,t,lateral);
  const error=Math.hypot(pose.x-x,pose.z-z)*course.metersPerUnit,vertical=Math.abs(pose.y-y)*course.metersPerUnit;
  if(vertical>2.5)continue;
  if(!nearest||error<nearest.error)nearest={index,t,x,y,z,lateralMeters:lateral,error,vertical,distanceMeters:s.startMeters+s.lengthMeters*t,widthMeters:s.widthMeters};
 }
 return nearest;
}

export function raceGridPose(course,index=0){
 if(!Number.isInteger(index)||index<0||index>=course.participants)throw Error('invalid_race_grid_slot');
 const distanceMeters=2+(Math.ceil(course.participants/2)-1-Math.floor(index/2))*8;
 const s=course.segments.find(segment=>segment.startMeters+segment.lengthMeters>=distanceMeters)||course.segments.at(-1);
 const forward=s.forward,along=(distanceMeters-s.startMeters)/course.metersPerUnit;
 const lateral=(course.participants===1?0:index%2===0?-1.4:1.4)/course.metersPerUnit;
 return {x:s.a.x+forward.x*along+forward.z*lateral,y:sampleRaceSegmentY(s,along*course.metersPerUnit/s.lengthMeters,lateral*course.metersPerUnit),
  z:s.a.z+forward.z*along-forward.x*lateral,yaw:Math.atan2(forward.x,forward.z)};
}

export function createRaceProgress(pose,nowMs){
 if(!finitePoint(pose)||!Number.isFinite(nowMs))throw Error('invalid_race_pose');
 return {nextGate:0,lap:1,finished:false,invalid:false,penaltyMs:0,lastPose:{...pose},lastAtMs:nowMs,lapStartedAtMs:nowMs,lapTimes:[],bestLapMs:null};
}
export function advanceRaceProgress(course,progress,pose,nowMs,{startedAtMs,maximumMetersPerSecond=85}={}){
 if(progress.finished||progress.invalid)return progress;
 if(!Number.isFinite(startedAtMs)||!(maximumMetersPerSecond>0&&maximumMetersPerSecond<=150))throw Error('invalid_race_clock');
 if(!finitePoint(pose)||!Number.isFinite(nowMs)||!(nowMs>progress.lastAtMs))throw Error('invalid_race_pose');
 const elapsed=(nowMs-progress.lastAtMs)/1000,travel=distance(progress.lastPose,pose)*course.metersPerUnit;
 if(elapsed>10||travel>maximumMetersPerSecond*elapsed+1.5)throw Error('implausible_race_motion');
 const projection=projectRacePosition(course,pose);
 if(!projection||projection.error>projection.widthMeters*.5+.5)throw Error('outside_race_course');
 const sweepSteps=Math.ceil(travel/2);
 if(sweepSteps>750)throw Error('implausible_race_motion');
 for(let step=1;step<sweepSteps;step++){
  const t=step/sweepSteps,from=progress.lastPose,sample=projectRacePosition(course,{x:from.x+(pose.x-from.x)*t,y:from.y+(pose.y-from.y)*t,z:from.z+(pose.z-from.z)*t});
  if(!sample||sample.error>sample.widthMeters*.5+.5)throw Error('outside_race_course');
 }
 const next={...progress,lastPose:{...pose},lastAtMs:nowMs,lapTimes:[...progress.lapTimes]};
 if(nowMs<startedAtMs){if(travel>.3)throw Error('race_false_start');return next;}
 const from=progress.lastPose;
 for(let count=0;count<8&&!next.finished;count++){
  const gate=course.gates[next.nextGate],f=gate.forward;
  const a=(from.x-gate.x)*f.x+(from.z-gate.z)*f.z,b=(pose.x-gate.x)*f.x+(pose.z-gate.z)*f.z;
  if(!(a<=0&&b>0))break;
  const t=-a/(b-a),x=from.x+(pose.x-from.x)*t,z=from.z+(pose.z-from.z)*t,y=from.y+(pose.y-from.y)*t;
  if(Math.abs((x-gate.x)*f.z-(z-gate.z)*f.x)*course.metersPerUnit>gate.halfWidthMeters||Math.abs(y-gate.y)*course.metersPerUnit>2)break;
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
