// Preparation data for the existing road compiler, never a height authority.
// Positive extents follow its (-tangent.z, tangent.x) normal. Source nodes and
// route distances stay intact when an asymmetric apron widens the pavement.
import {BANKED_ROAD_MAXIMUM_CROSSFALL} from '../physics/road-plane-dynamics.js';
import {roadPavementNodeFrames} from './road-pavement-coordinate-frame.js';
export function validateRoadPavementSections(profile,{venueId,sourceFeatureId,sourceSha256,nodeIds}){
 const fail=()=>{throw Error('reviewed_pavement_sections_invalid');};
 if(typeof venueId!=='string'||!venueId||typeof sourceFeatureId!=='string'||!sourceFeatureId||!/^[a-f0-9]{64}$/.test(sourceSha256)||profile?.version!==1||profile.venueId!==venueId||profile.sourceFeatureId!==sourceFeatureId||profile.sourceSha256!==sourceSha256||
  !/^[a-f0-9]{64}$/.test(profile.observationSha256)||!Array.isArray(nodeIds)||nodeIds.length<2||
  JSON.stringify(profile.nodeIds)!==JSON.stringify(nodeIds)||!Array.isArray(profile.samples)||profile.samples.length<2||profile.samples.length>1000)fail();
 const authoredBank=profile.samples.some(s=>s?.bankAngleDegrees!==undefined),authoredApron=profile.samples.some(s=>s?.apronAngleDegrees!==undefined);
 const fit=profile.nativePlaneFit;
 if(fit!==undefined&&(fit?.version!==1||authoredBank||authoredApron||!Number.isFinite(fit.halfWidthMeters)||fit.halfWidthMeters<1.5||fit.halfWidthMeters>3||
  !Number.isFinite(fit.maximumCoreResidualMeters)||fit.maximumCoreResidualMeters<=0||fit.maximumCoreResidualMeters>.05||
  !Number.isFinite(fit.maximumEdgeDepartureMeters)||fit.maximumEdgeDepartureMeters<=0||fit.maximumEdgeDepartureMeters>1))fail();
 if(authoredApron&&(!authoredBank||profile.apronInterpretation!=='authored-drainage-plane-native-inner-anchor'))fail();
 if(authoredBank&&(!profile.bankingReference||!/^https:\/\/[A-Za-z0-9.-]+\//.test(profile.bankingReference.url)))fail();
 let previous=-1;
 const samples=profile.samples.map(s=>{
  const {segment,fraction,positiveMeters,negativeMeters,bankNegativeMeters}=s||{},position=segment+fraction;
  if(!Number.isInteger(segment)||segment<0||segment>=nodeIds.length-1||!Number.isFinite(fraction)||fraction<0||fraction>1||!(position>previous)||
   ![positiveMeters,negativeMeters,bankNegativeMeters].every(Number.isFinite)||positiveMeters<.3||positiveMeters>15||
   negativeMeters<3||positiveMeters+negativeMeters<6||positiveMeters+negativeMeters>30||bankNegativeMeters<3||bankNegativeMeters>negativeMeters-1)fail();
  if(authoredBank&&(!Number.isFinite(s.bankAngleDegrees)||s.bankAngleDegrees<0||Math.tan(s.bankAngleDegrees*Math.PI/180)>BANKED_ROAD_MAXIMUM_CROSSFALL))fail();
  if(authoredApron&&(!Number.isFinite(s.apronAngleDegrees)||s.apronAngleDegrees<0||Math.tan(s.apronAngleDegrees*Math.PI/180)>.15))fail();
  previous=position;return Object.freeze({segment,fraction,positiveMeters,negativeMeters,bankNegativeMeters,...(authoredBank?{bankAngleDegrees:s.bankAngleDegrees}:{}),...(authoredApron?{apronAngleDegrees:s.apronAngleDegrees}:{})});
 });
 if(samples[0].segment!==0||samples[0].fraction!==0||samples.at(-1).segment!==nodeIds.length-2||samples.at(-1).fraction!==1)fail();
 return Object.freeze({version:1,venueId,sourceFeatureId,sourceSha256,observationSha256:profile.observationSha256,nodeIds:Object.freeze([...nodeIds]),samples:Object.freeze(samples),
  ...(fit?{nativePlaneFit:Object.freeze({version:1,halfWidthMeters:fit.halfWidthMeters,maximumCoreResidualMeters:fit.maximumCoreResidualMeters,maximumEdgeDepartureMeters:fit.maximumEdgeDepartureMeters})}:{}),
  ...(authoredApron?{apronInterpretation:profile.apronInterpretation}:{}),
  ...(authoredBank?{bankingReference:Object.freeze({url:profile.bankingReference.url,interpretation:'documented angles; authored transition locations'})}:{})});
}

export function roadPavementSectionsInWorld(profile,points,metersPerWorldUnit,{geoToWorld}={}){
 if(!profile)return null;
 if(profile.coordinateSpace!==undefined||!Number.isFinite(metersPerWorldUnit)||!(metersPerWorldUnit>0&&metersPerWorldUnit<=10)||!Array.isArray(points)||points.length!==profile.nodeIds.length)throw Error('reviewed_pavement_coordinates_invalid');
 const distances=[0];for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],span=Math.hypot(b.x-a.x,b.z-a.z);if(!Number.isFinite(span)||span<=0)throw Error('reviewed_pavement_coordinates_invalid');distances.push(distances.at(-1)+span);
 }
 const samples=profile.samples.map(s=>Object.freeze({distance:distances[s.segment]+(distances[s.segment+1]-distances[s.segment])*s.fraction,
  positive:s.positiveMeters/metersPerWorldUnit,negative:s.negativeMeters/metersPerWorldUnit,bankNegative:s.bankNegativeMeters/metersPerWorldUnit,
  ...(s.bankAngleDegrees!==undefined?{bankSlope:Math.tan(s.bankAngleDegrees*Math.PI/180)}:{}),...(s.apronAngleDegrees!==undefined?{apronSlope:Math.tan(s.apronAngleDegrees*Math.PI/180)}:{})}));
 const continuations={};
 for(const side of ['start','end'])if(profile.geographicContinuations?.[side]){
  if(typeof geoToWorld!=='function')throw Error('reviewed_pavement_coordinates_invalid');
  const p=profile.geographicContinuations[side],world=geoToWorld(p.lat,p.lon);
  if(![world?.x,world?.z].every(Number.isFinite))throw Error('reviewed_pavement_coordinates_invalid');continuations[side]=world;
 }
 const {geographicContinuations,...evidence}=profile;
 return Object.freeze({...evidence,coordinateSpace:'world',metersPerWorldUnit,nodeDistances:Object.freeze(distances),nodeFrames:roadPavementNodeFrames(points,continuations),...(geographicContinuations?{connectedEnds:Object.freeze({start:!!continuations.start,end:!!continuations.end})}:{}),samples:Object.freeze(samples),length:distances.at(-1),maximumExtent:Math.max(...samples.map(s=>Math.max(s.positive,s.negative)))});
}

export function sampleRoadPavementSection(profile,distance){
 if(profile?.coordinateSpace!=='world'||!Number.isFinite(distance)||!profile.samples?.length)throw Error('reviewed_pavement_coordinates_invalid');
 const samples=profile.samples;let lo=0,hi=samples.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(samples[mid].distance<distance)lo=mid;else hi=mid;}
 const a=samples[lo],b=samples[hi],t=Math.max(0,Math.min(1,(distance-a.distance)/(b.distance-a.distance))),at=key=>a[key]+(b[key]-a[key])*t,
  positive=at('positive'),negative=at('negative'),bankNegative=at('bankNegative');
 return {positive,negative,bankNegative,width:positive+negative,offset:(positive-negative)*.5,bankWidth:positive+bankNegative,bankOffset:(positive-bankNegative)*.5,...(a.bankSlope!==undefined?{bankSlope:at('bankSlope')}:{}),...(a.apronSlope!==undefined?{apronSlope:at('apronSlope')}:{})};
}

export function roadPavementSectionForSegment(feature,segment,fraction=.5){
 const profile=feature?.transportRecord?.crossSection?.pavementSections;if(!profile)return null;
 if(!Number.isInteger(segment)||segment<0||segment>=profile.nodeDistances.length-1||!Number.isFinite(fraction)||fraction<0||fraction>1)throw Error('reviewed_pavement_station_required');
 const a=profile.nodeDistances[segment],b=profile.nodeDistances[segment+1];return sampleRoadPavementSection(profile,a+(b-a)*fraction);
}

// Read the compiler's packed four-point transects. The same publication is
// sampled by terrain grading, mesh construction and physical contacts.
export function sampleRoadPavementHeight(model,distance,lateral){
 const d=model?.distances,offsets=model?.pavementOffsets,heights=model?.pavementHeightDeltas,centers=model?.centerHeights;
 if(!d||d.length<2||centers?.length!==d.length||offsets?.length!==d.length*4||heights?.length!==d.length*4||![distance,lateral].every(Number.isFinite))return NaN;
 let lo=0,hi=d.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(d[mid]<distance)lo=mid;else hi=mid;}
 const t=Math.max(0,Math.min(1,(distance-d[lo])/(d[hi]-d[lo]))),at=(array,k)=>array[lo*4+k]+(array[hi*4+k]-array[lo*4+k])*t,center=centers[lo]+(centers[hi]-centers[lo])*t;
 if(lateral<=at(offsets,0))return center+at(heights,0);
 for(let k=1;k<4;k++){const right=at(offsets,k);if(lateral<=right){const left=at(offsets,k-1),fraction=(lateral-left)/(right-left);return center+at(heights,k-1)+(at(heights,k)-at(heights,k-1))*fraction;}}
 return center+at(heights,3);
}
