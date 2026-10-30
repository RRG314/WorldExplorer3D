import {buildRaceRoadGraph} from './course-rules.js';

import {normalizeRaceVenueSource} from './venue-course-policy.js';

const fail=()=>{throw Error('race_invalid_district');};
const label=(value,max)=>String(value||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max);
// An approved snapshot has millimetre precision in metres. Private V1 drafts
// retain their original fingerprints; canonicalisation applies only at intake.
export function canonicalRaceDistrict(raw,{partialVenue=false}={}){
 if(raw?.type!=='RaceDistrictFacts'||raw.version!==1||!Array.isArray(raw.roads)||!raw.roads.length||raw.roads.length>5000)fail();
 const venueSource=normalizeRaceVenueSource(raw.venueSource);
 const m=raw.metersPerUnit;if(!Number.isFinite(m)||m<=0||m>10)fail();
 const number=n=>{if(!Number.isFinite(n)||Math.abs(n)>1e7)fail();return Math.round(n*m*1000)/(m*1000);};
 const lateral=s=>{if(s.lateralSamples===undefined)return {};
  if(!Array.isArray(s.lateralSamples)||s.lateralSamples.length<3||s.lateralSamples.length>32)fail();
  return {lateralSamples:s.lateralSamples.map(p=>({offsetMeters:number(p?.offsetMeters),y:number(p?.y)}))};};
 const point=p=>({x:number(p?.x),y:number(p?.y),z:number(p?.z),connectionLayer:label(p?.connectionLayer,180)});
 const anchor={lat:Number(raw.anchor?.lat),lon:Number(raw.anchor?.lon)};
 if(!Number.isFinite(anchor.lat)||Math.abs(anchor.lat)>85||!Number.isFinite(anchor.lon)||Math.abs(anchor.lon)>180)fail();
 const locationId=`earth:${Math.round(anchor.lat*1e7)}:${Math.round(anchor.lon*1e7)}`;
 const roads=raw.roads.map(r=>{
  if(!r.sourceId||r.sourceId.length>180||!['surface','bridge','tunnel'].includes(r.structure)||!['both','forward','reverse',undefined].includes(r.direction)||r.driveable!==true||r.supported!==true)fail();
  const samples=r.heightSamples;if(!Array.isArray(samples)||samples.length<2||samples.length>250)fail();
  return {sourceId:label(r.sourceId,180),sourceFeatureId:label(r.sourceFeatureId,180),label:label(r.label,100),a:point(r.a),b:point(r.b),
   ...(r.surfaceModel!==undefined?{surfaceModel:r.surfaceModel}:{}),
   widthMeters:number(r.widthMeters),direction:r.direction||'both',structure:r.structure,clearanceMeters:number(r.clearanceMeters||0),driveable:true,supported:true,
   heightSamples:samples.map(s=>({t:s.t,y:number(s.y),leftY:number(s.leftY),rightY:number(s.rightY),...lateral(s)})),heightSampleSpanMeters:number(r.heightSampleSpanMeters)};
 }).sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
 const facts={type:'RaceDistrictFacts',version:1,...(venueSource?{venueSource}:{}),locationId,locationLabel:label(raw.locationLabel,80),anchor,metersPerUnit:m,roads};
 const graph=buildRaceRoadGraph(roads,{metersPerUnit:m,venueSource,partialVenue});if(graph.edges.length<roads.length)fail();return facts;
}
