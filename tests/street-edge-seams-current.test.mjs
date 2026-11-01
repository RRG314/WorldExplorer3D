import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';
import {compileMappedVenueLayout} from '../app/js/racing/venue-layout.js';
import {authorVenueEdgeRecipes} from '../app/js/racing/venue-edge-authoring.js';
import {RACING_VENUE_SOURCES} from '../app/js/racing/venue-source-packs.js';
import {prepareCarriagewayTiles} from '../app/js/world/compiler/street-carriageway.js';
import {meshCarriagewayTile} from '../app/js/world/compiler/street-carriageway-mesh.js';
import {roadSourceCoordinateTolerance} from '../app/js/terrain/published-road-integrity.js';
import {STREET_POLYGON_GRID_WORLD} from '../app/js/world/compiler/street-coordinate-grid.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';

test('accepted sloping band pieces cannot be snapped back into flat asphalt slivers',()=>{
 const source=JSON.parse(fs.readFileSync(new URL('../app/assets/racing/nordschleife/source.json',import.meta.url))),descriptor=RACING_VENUE_SOURCES.find(d=>d.id==='nurburgring-nordschleife'),layout=compileMappedVenueLayout(source),way=layout.ways.get(1009142895),frame=earthCoordinateFrame(descriptor.anchor,100000),unit=1.11,
  road={pts:way.geometry.map(p=>frame.toWorld(p.lat,p.lon)),width:7.8/unit,metersPerWorldUnit:unit,structureSemantics:{terrainMode:'at_grade'},edgeBandRecipe:authorVenueEdgeRecipes(layout,descriptor).get(way.id)},meshes=[];
 const partition=(v,sample)=>Float32Array.from(v.map((n,i)=>i%3===1?sample(v[i-1],v[i+1]):n));
 for(const tile of prepareCarriagewayTiles([road])){const data=meshCarriagewayTile(tile,()=>10,partition);for(const b of [data,data.edgeBands])if(b?.indices.length)meshes.push({geometry:{attributes:{position:{array:b.positions}},getIndex:()=>({array:b.indices})},userData:{terrainMode:'at_grade'}});}
 const contact=createRoadContactIndex(meshes),a=road.pts[5],b=road.pts[6],length=Math.hypot(b.x-a.x,b.z-a.z),nx=(b.z-a.z)/length,nz=-(b.x-a.x)/length;
 try{
  let previous=null;
  for(let i=0;i<=100;i++){
   const offset=-3.4965+i*.000005,x=b.x+nx*offset/unit,z=b.z+nz*offset/unit,y=contact.sampleAt(x,z,10,'at_grade');
   assert.ok(Number.isFinite(y),`missing shared top at lateral ${offset}`);
   assert.ok(y>10.025,`flat asphalt sliver at lateral ${offset}: ${y}`);
   if(previous!==null)assert.ok(Math.abs(y-previous)<.0003,`discontinuous top at lateral ${offset}`);
   previous=y;
  }
  const p=road.pts[4],q=road.pts[5],run=Math.hypot(q.x-p.x,q.z-p.z),fx=(q.x-p.x)/run,fz=(q.z-p.z)/run;
  for(let i=0;i<=100;i++){
   const offset=-3.9+i*.000005,x=(p.x+q.x)/2+fz*offset/unit,z=(p.z+q.z)/2-fx*offset/unit,y=contact.sampleAt(x,z,10,'at_grade');
   assert.ok(Number.isFinite(y)&&y>10.035,`the accepted outer outline cannot contain a flat sliver: ${offset},${y}`);
  }
  const start=road.pts[8],end=road.pts[9],distance=Math.hypot(end.x-start.x,end.z-start.z),vx=(end.x-start.x)/distance,vz=(end.z-start.z)/distance,along=3/11;
  for(const offset of [-3.8996425337114218,-3.899585075595875,-3.8995]){
   const x=start.x+(end.x-start.x)*along+vz*offset/unit,z=start.z+(end.z-start.z)*along-vx*offset/unit,raw=contact.sampleAt(x,z,10,'at_grade'),projected=Number.isFinite(raw)?null:contact.nearestSurfaceAt(x,z,roadSourceCoordinateTolerance(x,z,STREET_POLYGON_GRID_WORLD),'at_grade'),y=raw??projected?.y;
   if(projected)assert.ok(projected.distance<.001,'only existing source/render precision may project to a real top');
   assert.ok(Number.isFinite(y)&&y>10.015,`the tapered outer top must cover its accepted outline: ${offset},${y}`);
  }
  const outside=-3.903;assert.equal(contact.sampleAt((p.x+q.x)/2+fz*outside/unit,(p.z+q.z)/2-fx*outside/unit,10,'at_grade'),null,'the compiler pad cannot expand the existing road footprint');
 }finally{contact.dispose();}
});
