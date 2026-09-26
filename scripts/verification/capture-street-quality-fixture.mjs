// Offline normalization of explicitly downloaded public map and Terrarium files.
// Usage: node .../capture-street-quality-fixture.mjs monaco|san-francisco
import fs from 'node:fs';
import {PNG} from 'pngjs';
import {normalizeTransportSource} from '../../app/js/world/compiler/transport-source-normalizer.js';
import {classifyStructureSemantics} from '../../app/js/structure-semantics/classification.js?v=2';
const cities={monaco:{lat:43.7384,lon:7.4246,map:'/tmp/monaco-street-osm.json',tiles:[[17059,11948,'/tmp/monaco-terrain.png'],[17059,11947,'/tmp/monaco-terrain-north.png']]},'san-francisco':{lat:37.7924,lon:-122.4147,map:'/tmp/sf-hill-street-osm.json',tiles:[[5241,12663,'/tmp/sf-terrain.png']]}};
const name=process.argv[2],city=cities[name];if(!city)throw new Error('Choose monaco or san-francisco');
const raw=JSON.parse(fs.readFileSync(city.map)),scale=100000,mpu=1.11;
const point=p=>({x:(p.lon-city.lon)*Math.cos(city.lat*Math.PI/180)*scale,z:(city.lat-p.lat)*scale});
const input={roads:[],buildings:[],landuses:[],linearFeatures:[],metersPerWorldUnit:mpu,coverageBounds:{minX:-128,maxX:128,minZ:-128,maxZ:128}};
for(const way of raw.elements){const tags=way.tags||{},pts=way.geometry?.map(point);if(!pts?.length)continue;
 if(tags.building){input.buildings.push({pts:pts.slice(0,-1)});continue;}
 if(tags.landuse){input.landuses.push({pts:pts.slice(0,-1),type:tags.landuse,tags});continue;}
 if(!tags.highway)continue;
 const record=normalizeTransportSource({id:way.id,type:'way',providerNamespace:'osm'},tags);
 const semantics=classifyStructureSemantics(tags,{featureKind:'road',subtype:tags.highway});
 if(['footway','pedestrian','path','steps','cycleway'].includes(tags.highway)){
  input.linearFeatures.push({kind:'footway',subtype:tags.footway||tags.highway,width:Number(tags.width)||1.8,pts,sourceTags:tags,structureSemantics:semantics});
 }else input.roads.push({pts,width:record.crossSection.widthMeters,type:tags.highway,transportRecord:record,structureSemantics:semantics});
}
const images=new Map(city.tiles.map(([x,y,p])=>[`${x}:${y}`,PNG.sync.read(fs.readFileSync(p))]));
const height=(x,z)=>{const lat=city.lat-z/scale,lon=city.lon+x/(scale*Math.cos(city.lat*Math.PI/180));const tx=(lon+180)/360*32768,ty=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*32768;const im=images.get(`${Math.floor(tx)}:${Math.floor(ty)}`);if(!im)throw new Error(`Missing elevation tile ${tx},${ty}`);const px=Math.min(254,(tx%1)*255),py=Math.min(254,(ty%1)*255),ix=Math.floor(px),iy=Math.floor(py),a=px-ix,b=py-iy;const at=(dx,dy)=>{const i=((iy+dy)*256+ix+dx)*4;return (im.data[i]*256+im.data[i+1]+im.data[i+2]/256-32768)/mpu;};return at(0,0)*(1-a)*(1-b)+at(1,0)*a*(1-b)+at(0,1)*(1-a)*b+at(1,1)*a*b;};
const terrain={minX:-128,minZ:-128,step:8,size:33,heights:[]};for(let z=0;z<33;z++)for(let x=0;x<33;x++)terrain.heights.push(Math.round(height(-128+x*8,-128+z*8)*1000)/1000);
const fixture={name,origin:{lat:city.lat,lon:city.lon},source:{mapTimestamp:raw.osm3s.timestamp_osm_base,map:'OpenStreetMap ways via Overpass; buildings/roads/landuse within 200m; relations excluded',elevation:'AWS Open Data Terrarium z15, resampled to an 8-world-unit test grid',capturedAt:new Date().toISOString(),terrainUrls:city.tiles.map(([x,y])=>`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/${x}/${y}.png`)},input,terrain};
const out=`tests/fixtures/streets/${name}-hill-quality.json`;fs.writeFileSync(out,JSON.stringify(fixture)+'\n');console.log({out,roads:input.roads.length,buildings:input.buildings.length,heightRangeMeters:(Math.max(...terrain.heights)-Math.min(...terrain.heights))*mpu});
