import {canonicalRaceDistrict} from './district-facts.js';
const utf8=new TextEncoder();
export const RACE_DISTRICT_STORAGE_LIMITS=Object.freeze({inlineBytes:750*1024,chunkBytes:384*1024,totalBytes:4*1024*1024,chunks:12,roads:5000});
const size=value=>utf8.encode(JSON.stringify(value)).byteLength;
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
const fail=()=>{throw Error('race_district_storage_unavailable');};
export function raceDistrictChunkPath(id,index){
 if(!/^[a-f0-9]{64}$/.test(id||'')||!Number.isInteger(index)||index<0||index>=RACE_DISTRICT_STORAGE_LIMITS.chunks)fail();
 return `racingDistricts/${id}/racingRoadChunks/${String(index).padStart(4,'0')}`;
}
export async function prepareRaceDistrictStorage(input){
 const facts=canonicalRaceDistrict(input),bytes=size(facts),limits=RACE_DISTRICT_STORAGE_LIMITS;
 if(bytes>limits.totalBytes)throw Error('race_district_storage_capacity');
 if(bytes<=limits.inlineBytes)return {fields:{facts},chunks:[],facts};
 const {roads,...header}=facts,groups=[];let group=[],used=2;
 for(const road of roads){
  const added=size(road)+(group.length?1:0);
  if(added+2>limits.chunkBytes)throw Error('race_district_road_exceeds_chunk');
  if(used+added>limits.chunkBytes){groups.push(group);group=[];used=2;}
  group.push(road);used+=size(road)+(group.length>1?1:0);
 }
 if(group.length)groups.push(group);
 if(groups.length>limits.chunks)throw Error('race_district_storage_capacity');
 const chunks=[],descriptors=[];
 for(let index=0;index<groups.length;index++){
  const rows=groups[index],contentSha256=await hash(rows),bytes=size(rows);
  descriptors.push({index,roadCount:rows.length,bytes,contentSha256});
  chunks.push({index,record:{type:'RaceDistrictRoadChunk',version:1,index,roads:rows}});
 }
 return {facts,fields:{factsManifest:{type:'RaceDistrictRoadManifest',version:1,header,roadCount:roads.length,bytes,chunks:descriptors}},chunks};
}
export async function readRaceDistrictFacts(record,readChunk){
 if(!record)return null;
 if(record.facts){if(record.factsManifest)fail();return record.facts;}
 const manifest=record.factsManifest,limits=RACE_DISTRICT_STORAGE_LIMITS;
 if(manifest?.type!=='RaceDistrictRoadManifest'||manifest.version!==1||!manifest.header||
  !Number.isInteger(manifest.roadCount)||manifest.roadCount<1||manifest.roadCount>limits.roads||
  !Number.isInteger(manifest.bytes)||manifest.bytes<=limits.inlineBytes||manifest.bytes>limits.totalBytes||
  !Array.isArray(manifest.chunks)||!manifest.chunks.length||manifest.chunks.length>limits.chunks||typeof readChunk!=='function')fail();
 let expectedCount=0,totalBytes=0;
 for(let index=0;index<manifest.chunks.length;index++){
  const chunk=manifest.chunks[index];
  if(chunk.index!==index||!Number.isInteger(chunk.roadCount)||chunk.roadCount<1||chunk.roadCount>limits.roads||
   !Number.isInteger(chunk.bytes)||chunk.bytes<2||chunk.bytes>limits.chunkBytes||!/^[a-f0-9]{64}$/.test(chunk.contentSha256||''))fail();
  expectedCount+=chunk.roadCount;totalBytes+=chunk.bytes;
 }
 if(expectedCount!==manifest.roadCount||totalBytes>limits.totalBytes)fail();
 const roads=[];
 for(const descriptor of manifest.chunks){
  const chunk=await readChunk(descriptor.index);
  if(chunk?.type!=='RaceDistrictRoadChunk'||chunk.version!==1||chunk.index!==descriptor.index||!Array.isArray(chunk.roads)||chunk.roads.length!==descriptor.roadCount)fail();
  // Firestore map order is unspecified. Canonical schema construction binds
  // the values rather than incidental SDK object-property iteration order.
  const normalized=canonicalRaceDistrict({...manifest.header,roads:chunk.roads},{partialVenue:true}).roads;
  if(size(normalized)!==descriptor.bytes||await hash(normalized)!==descriptor.contentSha256)fail();
  roads.push(...normalized);
 }
 const facts=canonicalRaceDistrict({...manifest.header,roads});
 if(size(facts)!==manifest.bytes)fail();
 return facts;
}
