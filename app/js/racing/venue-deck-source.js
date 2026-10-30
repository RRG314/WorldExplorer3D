import {compileMappedVenueLayout,geographicVenueDistance} from './venue-layout.js';
import {parseMeters} from '../world/compiler/transport-source-normalizer.js?v=4';

// A verified source-load annotation, never a provider tag or a runtime sampler.
const reviewedDecks=Symbol('reviewed-venue-decks');
const fail=()=>{throw Error('venue_deck_source_invalid');};
const geographic=p=>p&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=85&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
const height=p=>geographic(p)&&Number.isFinite(p.heightMetersEgm2008)&&p.heightMetersEgm2008>=-500&&p.heightMetersEgm2008<=10000;
const geo=p=>({lat:p.latitude,lon:p.longitude});
const bridge=way=>way.tags?.bridge&&!['no','false','0'].includes(way.tags.bridge);

export function annotateReviewedVenueDecks(source,artifact,{descriptor,requiredArtifacts,contentSha256}){
 const layout=compileMappedVenueLayout(source),expected=layout.wayIds.filter(id=>bridge(layout.ways.get(id))),profiles=new Map(),pavements=new Map(),approaches=new Set();
 for(const id of expected){const i=layout.wayIds.indexOf(id),ids=layout.wayIds;for(const adjacent of [ids[(i-1+ids.length)%ids.length],ids[(i+1)%ids.length]])if(!expected.includes(adjacent))approaches.add(adjacent);}
 if(artifact?.type!=='ReviewedVenueDeckSource'||artifact.version!==1||artifact.venueId!==descriptor.id||
  artifact.sourceSha256!==descriptor.sourceSha256||!/^[a-f0-9]{64}$/.test(contentSha256)||
  artifact.targetCrs!=='EPSG:9056+3855'||artifact.license!=='DL-DE-BY-2.0'||
  artifact.normalization?.direction!=='inverse'||!Number.isFinite(artifact.normalization.operationAccuracyMeters)||artifact.normalization.operationAccuracyMeters<=0||
  !Array.isArray(artifact.bridges)||artifact.bridges.length!==expected.length||!expected.length||expected.length>32||
  !Array.isArray(artifact.groundArtifacts)||artifact.groundArtifacts.length!==requiredArtifacts.length||
  requiredArtifacts.some(r=>!artifact.groundArtifacts.some(a=>a.artifactId===r.artifactId&&a.contentSha256===r.contentSha256)))fail();
 if(artifact.pavements!==undefined&&(!Array.isArray(artifact.pavements)||artifact.pavements.length!==approaches.size))fail();
 for(const [kind,records,allowed,target] of [['deck',artifact.bridges,expected,profiles],['pavement',artifact.pavements||[],[...approaches],pavements]])for(const record of records){
  const way=layout.ways.get(record.sourceWayId),samples=record.samples;
  if(!allowed.includes(record.sourceWayId)||target.has(record.sourceWayId)||record.sourceVersion!==way.version||
   JSON.stringify(record.nodeIds)!==JSON.stringify(way.nodes)||
   record.reconstructedWidthMeters!==parseMeters(way.tags.width)||!(record.observedCoreWidthMeters>0)||
   record.observedCoreWidthMeters>record.reconstructedWidthMeters||record.reconstructedWidthMeters>30||
   !Number.isFinite(record.maximumCoreResidualMeters)||record.maximumCoreResidualMeters<0||record.maximumCoreResidualMeters>.05||
   !Array.isArray(samples)||samples.length<2||samples.length>1000)fail();
  const excluded=kind==='pavement'?record.excludedReturns:[];
  if(kind==='pavement'&&(!(record.maximumAdjustmentMeters>0&&record.maximumAdjustmentMeters<=.05)||!Array.isArray(excluded)||excluded.length>64||
   excluded.some(p=>!Number.isInteger(p.sourceSegment)||p.sourceSegment<0||p.sourceSegment>=way.geometry.length-1||!Number.isFinite(p.fraction)||p.fraction<0||p.fraction>1||!Number.isFinite(p.maximumCoreResidualMeters)||p.maximumCoreResidualMeters<=.05)))fail();
  const reconstructedSpans=[];
  let previous=-1,previousDistance=0;
  const distances=[0];for(let i=1;i<way.geometry.length;i++)distances.push(distances.at(-1)+geographicVenueDistance(way.geometry[i-1],way.geometry[i]));
  const prepared=samples.map((s,i)=>{
   const a=way.geometry[s.sourceSegment],b=way.geometry[s.sourceSegment+1],index=s.sourceSegment+s.fraction;
   if(!Number.isInteger(s.sourceSegment)||!a||!b||!Number.isFinite(s.fraction)||s.fraction<0||s.fraction>1||
    !height(s)||!height(s.positiveNormal)||!(index>previous))fail();
   const expectedPoint={lat:a.lat+(b.lat-a.lat)*s.fraction,lon:a.lon+(b.lon-a.lon)*s.fraction};
   const distance=distances[s.sourceSegment]+s.fraction*(distances[s.sourceSegment+1]-distances[s.sourceSegment]);
   const lateral=geographicVenueDistance(geo(s),geo(s.positiveNormal));
   if(geographicVenueDistance(expectedPoint,geo(s))>.02||lateral<.5||lateral>1.5)fail();
   if(i&&distance-previousDistance>2.05){
    const missing=excluded.filter(p=>p.sourceSegment+p.fraction>previous&&p.sourceSegment+p.fraction<index);
    if(kind!=='pavement'||distance-previousDistance>8.05||!missing.length)fail();
    reconstructedSpans.push(Object.freeze({from:previous,to:index,lengthMeters:distance-previousDistance,excludedStations:missing.length}));
   }
   previous=index;previousDistance=distance;
   return Object.freeze({sourceSegment:s.sourceSegment,fraction:s.fraction,latitude:s.latitude,longitude:s.longitude,heightMetersEgm2008:s.heightMetersEgm2008,
    positiveNormal:Object.freeze({latitude:s.positiveNormal.latitude,longitude:s.positiveNormal.longitude,heightMetersEgm2008:s.positiveNormal.heightMetersEgm2008})});
  });
  if(prepared[0].sourceSegment!==0||prepared[0].fraction!==0||prepared.at(-1).sourceSegment!==way.geometry.length-2||prepared.at(-1).fraction!==1)fail();
  if(excluded.some(p=>!reconstructedSpans.some(span=>p.sourceSegment+p.fraction>span.from&&p.sourceSegment+p.fraction<span.to))||
   new Set(excluded.map(p=>p.sourceSegment+p.fraction)).size!==excluded.length)fail();
  target.set(record.sourceWayId,Object.freeze({contentSha256,observedCoreWidthMeters:record.observedCoreWidthMeters,
   reconstructedWidthMeters:record.reconstructedWidthMeters,samples:Object.freeze(prepared),
   ...(kind==='pavement'?{maximumAdjustmentMeters:record.maximumAdjustmentMeters,reconstructedSpans:Object.freeze(reconstructedSpans)}:{})}));
 }
 // Keep the map inside this source object's bounded preparation lifetime.
 Object.defineProperty(source,reviewedDecks,{value:Object.freeze({contentSha256,profiles,pavements}),enumerable:false});
 return source;
}

export function reviewedVenueDeckProfile(source,descriptor,wayId){
 if(!descriptor.reviewedDeckProfiles)return null;
 const prepared=source?.[reviewedDecks];
 if(!prepared||prepared.contentSha256!==descriptor.reviewedDeckProfiles.contentSha256)throw Error('venue_deck_source_not_prepared');
 return prepared.profiles.get(wayId)||null;
}
export function reviewedVenuePavementProfile(source,descriptor,wayId){
 if(!descriptor.reviewedDeckProfiles)return null;
 const prepared=source?.[reviewedDecks];
 if(!prepared||prepared.contentSha256!==descriptor.reviewedDeckProfiles.contentSha256)throw Error('venue_deck_source_not_prepared');
 return prepared.pavements.get(wayId)||null;
}
