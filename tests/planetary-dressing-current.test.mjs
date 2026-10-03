import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {surfaceDressingLayout,createSurfaceDressing} from '../app/js/planetary/surface-dressing.js';
import {captureSurfaceLightPresentation} from '../app/js/planetary/surface-lighting.js';
import {setActivePlanetaryObstacles,queryPlanetaryObstacle,clearActivePlanetaryObstacles} from '../app/js/planetary/runtime/obstacle-authority.js?v=1';
import {resolvePlanetaryVehicleObstacle} from '../app/js/physics/planetary-obstacle-response.js';
import {disposeOwnedPlanetaryWorld} from '../app/js/planetary/owned-world-cache.js';

test('site geology is deterministic, bounded and leaves the mission approach clear',()=>{
 const options={bodyId:'moon',spawn:{x:200,z:-950},seed:81,bounds:{minX:0,maxX:600,minZ:-1300,maxZ:-600}};
 const layout=surfaceDressingLayout(options);assert.deepEqual(layout,surfaceDressingLayout(options));
 assert.ok(layout.gravel.length<=1800);assert.ok(layout.formations.length<=126&&layout.formations.length>0);
 for(const rock of layout.formations){assert.ok(Math.hypot(rock.x-200,rock.z+950)>55);assert.ok(rock.x-rock.radius>0&&rock.x+rock.radius<600);}
 assert.notDeepEqual(surfaceDressingLayout({...options,kind:'basalt'}).formations,layout.formations);
});
test('all local geology owns its GPU resources and uses the accepted ground sample',()=>{
 const root=createSurfaceDressing(THREE,{bodyId:'mars',kind:'layered',spawn:{x:0,z:0},sampleHeight:()=>100});
 assert.equal(root.children.length,2);assert.equal(root.userData.drawBudget,2);
 const matrix=new THREE.Matrix4();root.children[0].getMatrixAt(0,matrix);assert.ok(matrix.elements[13]>=100);
 let disposed=0;root.traverse(object=>{object.geometry?.addEventListener('dispose',()=>disposed++);object.material?.addEventListener('dispose',()=>disposed++);});
 disposeOwnedPlanetaryWorld({objects:[root]});assert.equal(disposed,4);
});
test('planetary rock authority stops a fast rover sweep and releases on scene exit',()=>{
 setActivePlanetaryObstacles('mars',[{id:'rock',x:10,z:0,radius:3}]);
 assert.ok(queryPlanetaryObstacle(10,0,.3,'mars'));
 const hit=resolvePlanetaryVehicleObstacle({x:0,z:0},{x:25,z:0},'mars');assert.equal(hit.collision,true);assert.ok(hit.x<5);
 assert.equal(resolvePlanetaryVehicleObstacle({x:10,z:0},{x:9,z:0},'mars').collision,false);
 assert.equal(resolvePlanetaryVehicleObstacle({x:0,z:0},{x:25,z:0},'moon').collision,false);
 clearActivePlanetaryObstacles('mars');assert.equal(queryPlanetaryObstacle(10,0,1,'mars'),null);
});
test('surface light ownership restores the incoming Earth environment and colors',()=>{
 const context={scene:new THREE.Scene(),renderer:{toneMappingExposure:1.6},sun:new THREE.DirectionalLight(0xaaccff,2),hemiLight:new THREE.HemisphereLight()};
 const environment=new THREE.Texture();context.scene.environment=environment;
 const restore=captureSurfaceLightPresentation(context);context.scene.environment=null;context.hemiLight.visible=false;context.sun.color.setHex(0xffffff);context.renderer.toneMappingExposure=1;
 restore();assert.equal(context.scene.environment,environment);assert.equal(context.hemiLight.visible,true);assert.equal(context.sun.color.getHex(),0xaaccff);assert.equal(context.renderer.toneMappingExposure,1.6);
});


test('a planetary camera or airborne rover can pass above a low formation',()=>{
 setActivePlanetaryObstacles('mars',[{id:'rock',x:10,z:0,radius:3,minY:0,maxY:2}]);
 assert.equal(queryPlanetaryObstacle(10,0,.3,'mars',{minY:3,maxY:4}),null);
 assert.ok(queryPlanetaryObstacle(10,0,.3,'mars',{minY:1,maxY:2}));
 assert.equal(resolvePlanetaryVehicleObstacle({x:0,z:0,y:5},{x:25,z:0},'mars').collision,false);
 clearActivePlanetaryObstacles('mars');
});

test('terrain maps reuse one raster and project the actual surface placement',async()=>{
 const {ctx}=await import('../app/js/shared-context.js?v=55');
 const {drawMoonMap}=await import('../app/js/map/moon.js');
 const keys=['onMars','onMoon','marsSurface','Walk','car'];const old=keys.map(k=>[k,ctx[k]]);const oldDocument=globalThis.document;
 let rasterWrites=0,draws=[];
 const mock=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>rasterWrites++,drawImage:(...args)=>draws.push(args)}, {get:(target,key)=>target[key]||(()=>{})});
 globalThis.document={createElement:()=>({getContext:()=>mock})};
 const surface=new THREE.Mesh(new THREE.PlaneGeometry(100,100,2,2).rotateX(-Math.PI/2));surface.position.set(200,0,300);
 Object.assign(ctx,{onMars:true,onMoon:false,marsSurface:surface,Walk:null,car:{x:200,z:300,angle:0,vx:0,vz:0}});
 try{drawMoonMap(mock,200,200,false);drawMoonMap(mock,200,200,false);assert.equal(rasterWrites,1);assert.equal(draws.length,2);assert.equal(draws[0][1],96.875);assert.equal(draws[0][2],96.875);surface.geometry.attributes.position.needsUpdate=true;drawMoonMap(mock,200,200,false);assert.equal(rasterWrites,2);}
 finally{for(const[k,v]of old)ctx[k]=v;globalThis.document=oldDocument;surface.geometry.dispose();surface.material.dispose();}
});


test('extrasolar solid surfaces select a sealed expedition rover and Earth retains its vehicle',async()=>{
 const {resolvePlanetaryVehicleKind}=await import('../app/js/planetary/vehicles.js');
 assert.equal(resolvePlanetaryVehicleKind('andromeda-explorer-a-b',{solidSurface:true}),'expedition');
 assert.equal(resolvePlanetaryVehicleKind('earth',{solidSurface:true}),null);
 assert.equal(resolvePlanetaryVehicleKind('unknown'),null);
 assert.equal(resolvePlanetaryVehicleKind('mars'),'mars');
});


test('replacing procedural expedition rovers disposes GPU resources and restores Earth children',async()=>{
 const {ctx}=await import('../app/js/shared-context.js?v=55');const {setPlanetaryVehicle}=await import('../app/js/planetary/vehicles.js');
 const oldMesh=ctx.carMesh,oldThree=globalThis.THREE;globalThis.THREE=THREE;
 const car=new THREE.Group(),earth=new THREE.Object3D();earth.visible=true;car.add(earth);ctx.carMesh=car;
 try {
  const rover=await setPlanetaryVehicle('andromeda-explorer-a-b',{solidSurface:true});assert.equal(earth.visible,false);assert.equal(rover.userData.vehicleKind,'expedition');
  let disposed=0;rover.traverse(object=>object.geometry?.addEventListener('dispose',()=>disposed++));
  await setPlanetaryVehicle('earth');assert.ok(disposed>0);assert.equal(rover.parent,null);assert.equal(earth.visible,true);
 }finally{ctx.carMesh=oldMesh;globalThis.THREE=oldThree;}
});
