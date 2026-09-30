import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sourcePath=process.argv[2];
if(!sourcePath)throw Error('Pass the Natural Earth 1:10m country GeoJSON file.');
const bytes=await fs.readFile(sourcePath),source=JSON.parse(bytes);
const countries=new Set(['JP','IT','ES','PT','GR','MT','NO','SE','FI','CA']);
function encodeRing(ring) {
 let lat=0,lon=0,result='';
 // Signed delta encoding, five bits per character, with printable ASCII offset.
 const append=value=>{let n=value<0?~(value<<1):value<<1;while(n>=32){result+=String.fromCharCode((32|(n&31))+63);n>>>=5;}result+=String.fromCharCode(n+63);};
 for(const [x,y] of ring){const nextLon=Math.round(x*1e5),nextLat=Math.round(y*1e5);append(nextLon-lon);append(nextLat-lat);lon=nextLon;lat=nextLat;}
 return result;
}
const regions=source.features.flatMap(feature=>{
 const code=feature.properties.ISO_A2_EH || feature.properties.ISO_A2;
 if(!countries.has(code))return [];
 const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
 return [{code,polygons:polygons.map(rings=>({rings:rings.map(encodeRing),bounds:[
  Math.min(...rings[0].map(p=>p[0])),Math.min(...rings[0].map(p=>p[1])),
  Math.max(...rings[0].map(p=>p[0])),Math.max(...rings[0].map(p=>p[1]))
 ]}))}];
});
if(regions.length!==countries.size)throw Error('Missing supported country polygons');
const output='// Generated geographic data. See building-region-data.PROVENANCE.json.\nexport const BUILDING_REGIONS = '+JSON.stringify(regions)+';\n';
await fs.writeFile('app/js/world/building-region-data.js',output);
await fs.writeFile('app/js/world/building-region-data.PROVENANCE.json',JSON.stringify({
 source:'Natural Earth 1:10m Admin 0 countries',license:'Public domain',
 sourceUrl:'https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_0_countries.geojson',
 sourceSha256:createHash('sha256').update(bytes).digest('hex'),
 outputSha256:createHash('sha256').update(output).digest('hex'),
 transformation:'Retain supported country polygons and holes without geometric simplification; coordinates rounded to 1e-5 degrees and delta encoded. ISO_A2_EH supplies the corrected ISO code.',
 use:'Approximate visual-region fallback only; not cadastral, jurisdictional or navigational authority.',countries:[...countries]
},null,2)+'\n');
console.log({regions:regions.length,bytes:Buffer.byteLength(output)});
