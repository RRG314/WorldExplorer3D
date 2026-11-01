import test from 'node:test';
import assert from 'node:assert/strict';
import {nearbyVegetationCells,semanticForestWeightAt,vegetationIdentitySeed,terrainForestAttributeWeight,terrainVegetationBounds} from '../app/js/world/vegetation-spatial.js';
test('Three r128 normalized byte attributes are read as fractions, not 0..255 density',()=>{
 const attribute={array:new Uint8Array([0,0,128,0]),itemSize:4,normalized:true};
 assert.equal(terrainForestAttributeWeight(attribute,0),128/255);
});
test('large mapped forest spends bounded placement budget near the player, without duplicate cells',()=>{
 const cells=[...nearbyVegetationCells({minX:-100000,maxX:100000,minZ:-100000,maxZ:100000},20,180)];
 assert.equal(cells.length,180);
 assert.equal(new Set(cells.map(p=>`${p.cx}:${p.cz}`)).size,180);
 assert.ok(cells.every(p=>Math.hypot(p.cx,p.cz)*20<250));
 assert.equal(vegetationIdentitySeed('osm:way:123'),vegetationIdentitySeed('osm:way:123'));
});
test('jittered points must still be supported by the accepted forest field',()=>{
 const mesh={position:{x:100,z:100},geometry:{parameters:{width:20,height:20,widthSegments:1,heightSegments:1},attributes:{terrainSurfaceMixA:{count:4,getZ:i=>[1,0,1,0][i]}}}};
 assert.equal(semanticForestWeightAt(mesh,90,100),1);
 assert.equal(semanticForestWeightAt(mesh,110,100),0);
 assert.equal(semanticForestWeightAt(mesh,130,100),0);
 assert.equal(semanticForestWeightAt(mesh,100,100),.5);
});


test('published detailed tiles read forest from their actual world-coordinate vertices',()=>{
 const positions=new Float32Array([-550,0,-2150,150,0,-2150,-550,0,-1450,150,0,-1450]),mesh={position:{x:0,z:0},geometry:{parameters:{width:700,height:700,widthSegments:1,heightSegments:1},attributes:{position:{array:positions,itemSize:3,count:4,getX:i=>positions[i*3],getZ:i=>positions[i*3+2]},terrainSurfaceMixA:{array:new Uint8Array([0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0]),itemSize:4,count:4,normalized:true}}}};
 assert.deepEqual(terrainVegetationBounds(mesh),{minX:-550,maxX:150,minZ:-2150,maxZ:-1450});
 assert.equal(semanticForestWeightAt(mesh,-226,-2106),1,'a baked world-coordinate tile is not centred on the mesh origin');
 assert.equal(semanticForestWeightAt(mesh,0,0),0);
 mesh.position.x=100;mesh.position.z=50;
 assert.equal(semanticForestWeightAt(mesh,-126,-2056),1,'an additional mesh transform still applies once');
});

test('detailed forest follows the actual float grid and rendered diagonal without interpolating into a clearing',()=>{
 const positions=new Float32Array([-550,0,-2150,-549,0,-2150,150,0,-2150,-550,0,-1450,-549,0,-1450,150,0,-1450]),field=new Uint8Array(24);
 field[2]=255;field[6]=255;
 const mesh={position:{x:0,z:0},geometry:{parameters:{width:700,height:700,widthSegments:2,heightSegments:1},attributes:{position:{array:positions,itemSize:3,count:6,getX:i=>positions[i*3],getZ:i=>positions[i*3+2]},terrainSurfaceMixA:{array:field,itemSize:4,count:6,normalized:true}}}};
 assert.equal(semanticForestWeightAt(mesh,-549.5,-1800),.5);
 const u=.6,v=.6,x=-549+699*u,z=-2150+700*v;
 assert.equal(semanticForestWeightAt(mesh,x,z),0,'the second rendered triangle is all clearing');
 mesh.geometry.attributes.position.count=5;
 assert.equal(terrainVegetationBounds(mesh),null);assert.equal(semanticForestWeightAt(mesh,x,z),0);
});
