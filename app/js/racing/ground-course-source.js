import {cleanGroundRaceLayout,normalizeGroundRaceDraft} from './route-draft.js';
import {canonicalRaceDistrict} from './district-facts.js';
import {createBuildingCollisionQuery} from '../physics/building-collision.js?v=5';
import {yieldToWorldFrame} from '../world/cooperative-scheduling.js?v=1';
// Survey an authored corridor against the current published terrain. This is a
// reader: it cannot create a road, move a building, flatten terrain or fill holes.
export async function collectGroundRaceDistrict(context,raw,{current=()=>true,yieldWork=yieldToWorldFrame}={}){
 const draft=normalizeGroundRaceDraft(raw),unit=context.METERS_PER_WORLD_UNIT||1.11,layout=cleanGroundRaceLayout(draft,unit),points=[layout[0]],publication=context.worldPublication;
 for(let i=1;i<layout.length;i++){const a=layout[i-1],b=layout[i],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*unit/40);for(let j=1;j<=n;j++)points.push({x:a.x+(b.x-a.x)*j/n,z:a.z+(b.z-a.z)*j/n});}
 if(!publication?.requestId||context.worldLoading||!context.SurfaceQuery?.driveAt)throw Error('race_world_not_ready');
 const checkBuilding=createBuildingCollisionQuery(context),roads=[],active=()=>current()&&context.worldPublication===publication&&!context.worldLoading;
 const sample=(x,z)=>{
  const s=context.SurfaceQuery.driveAt(x,z,{preferRoad:false});
  if(!s||s.kind!=='terrain'||!Number.isFinite(s.position?.y)||s.provenance?.confidence<.3)throw Error('race_ground_unsupported');
  const y=s.position.y,water=context.SurfaceQuery.waterAt?.(x,z);
  if(water?.feature&&Number.isFinite(water.position?.y)&&water.position.y>y-.1)throw Error('race_ground_water');
  if(checkBuilding(x,z,.25/unit,{actorBaseY:y,actorHeight:2.4/unit}).collision)throw Error('race_ground_blocked');
  return y;
 };
 for(let i=1;i<points.length;i++){
  if(!active())throw Error('race_world_changed');
  const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z)*unit,dx=(b.x-a.x)*unit/length,dz=(b.z-a.z)*unit/length,count=Math.max(1,Math.ceil(length/2)),heightSamples=[];
  for(let j=0;j<=count;j++){
   const t=j/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=sample(x,z),leftY=sample(x-dz*1.2/unit,z+dx*1.2/unit),rightY=sample(x+dz*1.2/unit,z-dx*1.2/unit);
   if(Math.max(Math.abs(leftY-y),Math.abs(rightY-y))*unit/1.2>.15)throw Error('race_ground_grade');
   const offsets=[...new Set([-draft.widthMeters/2,-1.2,0,1.2,draft.widthMeters/2,...Array.from({length:draft.widthMeters+1},(_,i)=>i-draft.widthMeters/2)])].sort((a,b)=>a-b),lateralSamples=offsets.map(offset=>({offsetMeters:offset,y:sample(x+dz*offset/unit,z-dx*offset/unit)}));
   for(let k=1;k<lateralSamples.length;k++){const a=lateralSamples[k-1],b=lateralSamples[k];if(Math.abs(b.y-a.y)*unit/(b.offsetMeters-a.offsetMeters)>.15)throw Error('race_ground_grade');}
   if(heightSamples.length&&Math.abs(y-heightSamples.at(-1).y)*unit/(length/count)>.15)throw Error('race_ground_grade');
   heightSamples.push({t,y,leftY,rightY,lateralSamples});
  }
  roads.push({sourceId:'authored-ground:'+i,sourceFeatureId:'authored-ground',surfaceKind:'ground',label:'Marked terrain course',a:{...a,y:heightSamples[0].y,connectionLayer:'authored-ground'},b:{...b,y:heightSamples.at(-1).y,connectionLayer:'authored-ground'},widthMeters:draft.widthMeters,driveable:true,supported:true,structure:'surface',direction:'forward',heightSamples,heightSampleSpanMeters:1.2});
  if(i%8===0)await yieldWork();
 }
 if(!active())throw Error('race_world_changed');
 const anchor=publication.location||context.LOC;
 return canonicalRaceDistrict({type:'RaceDistrictFacts',version:1,locationLabel:context.worldLoadRuntimeState?.location?.name||context.LOC?.name||'Current location',anchor:{lat:anchor.lat,lon:anchor.lon},metersPerUnit:unit,roads});
}
