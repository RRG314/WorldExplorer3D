import {performance} from 'node:perf_hooks';import fs from 'node:fs/promises';import {pathToFileURL} from 'node:url';import path from 'node:path';
import {resolveVehicleRoadContactPose} from '../../app/js/engine/vehicle-road-attitude.js';
import {vehicleDefinitionById} from '../../app/js/engine/vehicle-catalog.js';
import {createVehicleSpacing} from '../../app/js/living-world/vehicle-spacing.js';
const report={scope:'Isolated Node CPU work, not browser frame rate or an equivalence claim. Current support/spacing substeps versus a disposable full Rapier chassis world.',node:process.version,current:[],rapier:[]};
const variant=vehicleDefinitionById('cadillac_fleetwood');
for(const count of [1,8,24]){
 const agents=Array.from({length:count},(_,i)=>({id:String(i),variant,x:i*8,z:0,y:0,yaw:0,speed:8}));
 const start=performance.now();
 for(let i=0;i<600;i++){
   const spacing=createVehicleSpacing(agents,a=>a);for(const car of agents){car.z+=spacing.limit(car,0,.12)*.12;spacing.update(car,car);
   resolveVehicleRoadContactPose({...car,variant,sampleSurface:(x,z)=>.02*z});}
 }
 report.current.push({vehicles:count,steps:600,microsecondsPerStep:(performance.now()-start)*1000/600});
}
if(process.env.WE3D_RAPIER_MODULE){
 const R=await import(pathToFileURL(path.resolve(process.env.WE3D_RAPIER_MODULE)));await R.init();
 for(const count of [1,8,24]){
  const world=new R.World({x:0,y:-9.81,z:0});world.timestep=1/60;
  world.createCollider(R.ColliderDesc.cuboid(1000,.1,1000).setTranslation(0,-.1,0));
  const cars=[];for(let n=0;n<count;n++){
   const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(n*8,.9,0));
   world.createCollider(R.ColliderDesc.cuboid(1,.35,2.5).setMass(1930),body);
   const car=world.createVehicleController(body);car.indexUpAxis=1;car.setIndexForwardAxis=2;
   for(const z of [-1.57,1.57])for(const x of [-.8,.8]){car.addWheel({x,y:-.3,z},{x:0,y:-1,z:0},{x:-1,y:0,z:0},.3,.36);}
   for(let i=0;i<4;i++){car.setWheelSuspensionStiffness(i,35);car.setWheelSuspensionCompression(i,4.4);car.setWheelSuspensionRelaxation(i,5.2);car.setWheelFrictionSlip(i,4);}
   cars.push({body,car});
  }
  const start=performance.now();for(let frame=0;frame<600;frame++){
   for(const {car}of cars){for(let w=0;w<4;w++){car.setWheelEngineForce(w,frame<400?1800:0);car.setWheelBrake(w,frame>=400?100:0);}car.updateVehicle(1/60);}
   world.step();
  }
  const position=cars[0].body.translation(),speed=cars[0].car.currentVehicleSpeed();
  report.rapier.push({version:'0.21.0',vehicles:count,steps:600,microsecondsPerStep:(performance.now()-start)*1000/600,position,speed,
    finite:[position.x,position.y,position.z,speed].every(Number.isFinite),aboveGround:position.y>.2});
  world.free();
 }
}
const file=process.env.WE3D_PHYSICS_BENCHMARK_OUTPUT||'output/research/vehicle-foundation-2026-10-28/physics-benchmark.json';
await fs.writeFile(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
