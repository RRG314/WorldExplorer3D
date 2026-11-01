import test from 'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';import * as THREE from'three';
const code=fs.readFileSync(new URL('../app/js/urban-sandbox/curated-traffic-vehicle.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export \{[\s\S]*?\};/g,'');
test('a curated pickup keeps its forward axis and receives red rear lamps through the shared material adapter',()=>{
 const source=new THREE.Group(),front=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),new THREE.MeshStandardMaterial({name:'Headlights'})),rear=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),new THREE.MeshStandardMaterial({name:'BrakeLight'}));
 front.position.z=2;rear.position.z=-2;source.add(front,rear);
 const sandbox={THREE,Map,Set,Object,Number,String,Math,vehicleWheelRig:()=>[],VEHICLE_ROOT_TO_GROUND_METERS:1.12};vm.createContext(sandbox);vm.runInContext(code,sandbox);
 const visual=sandbox.prepareTrafficVisual(THREE,{root:source,record:{label:'Pickup',id:'traffic-utility-pickup-v1',dimensionsMeters:{width:2,height:2,length:5.35},budgets:{}}});visual.updateMatrixWorld(true);
 assert.ok(front.getWorldPosition(new THREE.Vector3()).z>rear.getWorldPosition(new THREE.Vector3()).z);
 assert.equal(rear.material.color.getHex(),0xa52c27);assert.equal(rear.material.emissive.getHex(),0x7c1118);
});
