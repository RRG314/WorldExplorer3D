import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';
import {compileMappedVenueLayout} from '../app/js/racing/venue-layout.js';
import {authorVenueEdgeRecipes} from '../app/js/racing/venue-edge-authoring.js';
import {RACING_VENUE_SOURCES} from '../app/js/racing/venue-source-packs.js';
import {prepareCarriagewayTiles} from '../app/js/world/compiler/street-carriageway.js';
import {meshCarriagewayTile} from '../app/js/world/compiler/street-carriageway-mesh.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';

test('sub-grid roof remnants cannot expand into overlapping raised driving tops at render precision',()=>{
 const source=JSON.parse(fs.readFileSync(new URL('../app/assets/racing/nordschleife/source.json',import.meta.url))),layout=compileMappedVenueLayout(source),descriptor=RACING_VENUE_SOURCES.find(d=>d.id==='nurburgring-nordschleife'),way=layout.ways.get(799394518),frame=earthCoordinateFrame({lat:50.359,lon:6.963},100000),unit=1.11,
  road={pts:way.geometry.map(p=>frame.toWorld(p.lat,p.lon)),width:10/unit,metersPerWorldUnit:unit,structureSemantics:{terrainMode:'at_grade'},edgeBandRecipe:authorVenueEdgeRecipes(layout,descriptor).get(way.id)},meshes=[],partition=(v,sample)=>Float32Array.from(v.map((n,i)=>i%3===1?sample(v[i-1],v[i+1]):n));
 for(const tile of prepareCarriagewayTiles([road])){const m=meshCarriagewayTile(tile,()=>10,partition);for(const b of[m,m.edgeBands])if(b?.indices.length)meshes.push({geometry:{attributes:{position:{array:b.positions}},getIndex:()=>({array:b.indices})},userData:{terrainMode:'at_grade'}});}
 const contact=createRoadContactIndex(meshes),a=road.pts[10],b=road.pts[11],length=Math.hypot(b.x-a.x,b.z-a.z),nx=(b.z-a.z)/length,nz=-(b.x-a.x)/length;
 try{let previous=null;for(let offset=4.51;offset<4.54;offset+=.0001){const x=a.x+nx*offset/unit,z=a.z+nz*offset/unit,low=contact.sampleAt(x,z,10,'at_grade'),high=contact.sampleAt(x,z,11,'at_grade');assert.ok(Number.isFinite(low)&&Number.isFinite(high),'the accepted top remains present');assert.ok(Math.abs(high-low)*unit<.0002,`overlapping roof heights at ${offset}: ${low},${high}`);if(previous!==null)assert.ok(Math.abs(low-previous)*unit<.0002,`physical step at ${offset}`);previous=low;}}finally{contact.dispose();}
});

test('the fine roof kernel retains resolved narrow pieces and the ordinary kernel retains its original policy',async()=>{
 const {createStreetPolygonKernel}=await import('../app/js/world/compiler/street-polygon-kernel.js'),fine=createStreetPolygonKernel({grid:.000001,minimumRingWidth:.000001}),ordinary=createStreetPolygonKernel({grid:.000001}),box=[[[0,0],[2,0],[2,2],[0,2],[0,0]]],strip=width=>[[[.1,.1],[1.1,.1],[1.1,.1+width],[.1,.1+width],[.1,.1]]],sliver=[[[.1,.1],[.161055,.1248],[.339341,.197219],[.1,.1]]];
 assert.equal(fine.intersection(sliver,box).length,0);
 assert.ok(ordinary.intersection(sliver,box).length,'default topology is unchanged');
 assert.ok(fine.intersection(strip(.00005),box).length,'a resolved 50 micrometre piece remains');
 assert.throws(()=>createStreetPolygonKernel({grid:.000001,minimumRingWidth:.001}),/coordinate grid/);
});
