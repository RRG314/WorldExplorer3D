import {vehicleFootprint} from '../engine/vehicle-footprint.js';
import {createUrbanVehicleVisual} from '../urban-sandbox/vehicle-visuals.js?v=12';
import {attachCuratedTrafficVehicle,syncCuratedVehicleGroundPivot} from '../urban-sandbox/curated-traffic-vehicle.js?v=5';
import {updateVehicleWheels} from '../transport/vehicle-wheel-motion.js';
import {carSpeedToWorldUnitsPerSecond} from '../physics/vehicle-speed-units.js?v=2';
import {buildRacePaint,raceCourseSurfacePoint} from './course-markings.js';
import {detachSceneObject} from '../engine/scene-object-lifecycle.js';
// Practice rivals are ghosts. A finished ghost leaves presentation, and a
// passing ghost must not put an opaque body around the active cabin/VR eye.
// Timing and actor motion continue to belong to the race session.
export function raceGhostVisible(player,variant,{immersive=false,eye}={}) {
 if(player.dnf||player.progress?.finished)return false;
 if(!immersive||!eye||!player.pose)return true;
 const box=vehicleFootprint(player.pose,variant,.2),dx=eye.x-box.x,dz=eye.z-box.z;
 if(eye.y<box.y-.2||eye.y>box.y+box.height+.2)return true;
 return Math.abs(dx*box.sx+dz*box.sz)>=box.width||Math.abs(dx*box.fx+dz*box.fz)>=box.length;
}
export async function prepareRacePresentation(THREE,context,course,rivals,{signal,current}) {
 const root=new THREE.Group();root.name='Scoped mapped road race';const visuals=[];let disposed=false;
 const material=new THREE.MeshBasicMaterial({color:0xb7f568,transparent:true,opacity:.8,depthWrite:false});
 const pole=new THREE.BoxGeometry(.16,2.8,.16),gates=[];
 for(let i=0;i<3;i++) {
  const group=new THREE.Group();for(const side of [-1,1]){const mesh=new THREE.Mesh(pole,material);mesh.position.y=1.4;mesh.userData.side=side;group.add(mesh);}
  root.add(group);gates.push(group);
 }
 const lineGeometry=new THREE.BufferGeometry().setFromPoints(course.points.map(p=>new THREE.Vector3(p.x,p.y+.08,p.z)));
 const lineMaterial=new THREE.LineBasicMaterial({color:0xb7f568,transparent:true,opacity:.45});root.add(new THREE.Line(lineGeometry,lineMaterial));
 const paint=buildRacePaint(course),paintGeometry=new THREE.BufferGeometry();paintGeometry.setAttribute('position',new THREE.BufferAttribute(paint.positions,3));paintGeometry.setAttribute('color',new THREE.BufferAttribute(paint.colors,3));
 const paintMaterial=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 const painted=new THREE.Mesh(paintGeometry,paintMaterial);painted.name='Surveyed finish and full-chassis grid paint';root.add(painted);
 const dispose=()=>{if(disposed)return;disposed=true;for(const visual of visuals)visual.dispose();detachSceneObject(root);pole.dispose();material.dispose();lineGeometry.dispose();lineMaterial.dispose();paintGeometry.dispose();paintMaterial.dispose();};
 try {
  for(let i=0;i<rivals.length;i++) {
   if(!current()||signal.aborted)throw Error('race_world_changed');
   const profile=rivals[i].profile,visual=createUrbanVehicleVisual(THREE,{id:`rival:${i}`,variant:profile.variant,condition:profile.conditionValue});
   visuals.push(visual);
   const ready=await attachCuratedTrafficVehicle(THREE,visual.root,{variantId:profile.variant.id,color:[0xd05f39,0x6c9ed3,0xb4a080][i],signal,isCurrent:current});
   if(!ready||!current())throw Error('race_rival_model_unavailable');
   root.add(visual.root);
  }
  return Object.freeze({root,dispose,
   mount(){if(disposed||!current())throw Error('race_world_changed');context.scene.add(root);},
   update(snapshot,uid,dt){
    const player=snapshot.players.find(p=>p.uid===uid),next=player?.progress?.nextGate||0;
    for(let i=0;i<gates.length;i++) {
     const gate=course.gates[next+i],host=gates[i];host.visible=!!gate&&!player?.progress?.finished;
     if(!gate)continue;host.position.set(gate.x,gate.y+.08,gate.z);host.rotation.y=Math.atan2(gate.forward.x,gate.forward.z);
     for(const mesh of host.children){const lateral=mesh.userData.side*(gate.halfWidthMeters-.2);mesh.position.x=lateral/course.metersPerUnit;
      mesh.position.y=1.4+raceCourseSurfacePoint(course,gate.distanceMeters,lateral).y-gate.y;}
    }
    for(const p of snapshot.players)if(p.ai&&p.pose) {
     const visual=visuals[p.slot-1];if(!visual)continue;const state=p.vehicleState;
     const immersive=!!context.vrPresentation?.active||context.camMode===1||context.camera?.userData?.vehicleClearanceMode==='clearance-first-person';
     visual.root.visible=raceGhostVisible(p,rivals[p.slot-1].profile.variant,{immersive,eye:context.camera?.position});
     visual.root.position.set(p.pose.x,state?.y??p.pose.y+1.2,p.pose.z);
     visual.root.rotation.set(state?.terrainPitch||0,p.pose.yaw,state?.terrainRoll||0,'YXZ');
     syncCuratedVehicleGroundPivot(visual.root);
     updateVehicleWheels(visual.wheels,carSpeedToWorldUnitsPerSecond(p.speed,course.metersPerUnit)*dt,state?.steerAngle||0);
     visual.setCondition(p.condition);visual.updateDamageVisual(snapshot.serverAtMs/1000);
    }
   }});
 } catch(error){dispose();throw error;}
}
