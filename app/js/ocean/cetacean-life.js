import {COMMON_DOLPHIN,commonDolphinEligibility,dolphinWaterEnvelope,dolphinTargetDepth} from './cetacean-rules.js';
import {loadDolphinVisual} from './cetacean-visual.js';

// One bounded population owned and retired by the existing ocean life cycle.
// Mammals never enter fishing pools or catch/weapon target lists.
export function createCetaceanLife({THREE,oceanMode,sampleWater,isBlocked,loadVisual=loadDolphinVisual}) {
  let generation=0,controller=null,time=0;
  const look=new THREE.Object3D(),target=new THREE.Vector3();
  function clear(){
    generation++;controller?.abort();controller=null;time=0;
    for(const animal of oceanMode.cetaceans||[]){animal.visual?.dispose();animal.mesh.parent?.remove(animal.mesh);}
    oceanMode.cetaceans=[];oceanMode.cetaceanPlan=null;
  }
  function valid(point,radius){
    const v=dolphinWaterEnvelope(sampleWater(point.x,point.z));
    if(!v||Math.hypot(point.x,point.z)*v.metersPerWorldUnit>240)return false;
    // Surface breathing permits the dorsal fin above water; the full body
    // envelope still clears the bed, reef, vessel, sub and player.
    return point.y>=v.bottomY+radius+.2&&point.y<=v.surfaceY+.12/v.metersPerWorldUnit&&
      point.y>=v.surfaceY-20/v.metersPerWorldUnit&&!isBlocked(point,radius);
  }
  function init(scene,context){
    clear();const plan=commonDolphinEligibility(context,oceanMode.depthProfile);oceanMode.cetaceanPlan=plan;
    if(!plan.allowed)return Promise.resolve();
    const current=generation;controller=new AbortController();const signal=controller.signal,pending=[];
    for(let i=0;i<COMMON_DOLPHIN.count;i++){
      const origin=dolphinWaterEnvelope(sampleWater(0,0));if(!origin)continue;
      const x=(35+Math.cos(i*.2)*35)/origin.metersPerWorldUnit,z=(45+Math.sin(i*.2)*35)/origin.metersPerWorldUnit;
      const v=dolphinWaterEnvelope(sampleWater(x,z));if(!v)continue;
      const units=v.metersPerWorldUnit,length=2.1+i*.15,radius=length*.58/units;
      const point={x,y:v.surfaceY-dolphinTargetDepth(0,i*2)/units,z};
      if(!valid(point,radius))continue;
      const mesh=new THREE.Group();mesh.name=`Ocean wildlife · ${COMMON_DOLPHIN.label}`;
      mesh.userData={speciesId:COMMON_DOLPHIN.speciesId,livePresenceClaim:false,catchable:false};mesh.visible=false;
      mesh.position.set(point.x,point.y,point.z);mesh.rotation.y=-i*.2;mesh.scale.setScalar(length/COMMON_DOLPHIN.lengthMeters/units);scene.add(mesh);
      const animal={mesh,radius,units,phase:i*2,orbitPhase:i*.2,visual:null,visualState:'loading',speedMeters:2.5+i*.07};oceanMode.cetaceans.push(animal);
      pending.push(loadVisual(THREE,{signal,phase:i*.7}).then(visual=>{
        if(signal.aborted||current!==generation){visual.dispose();return;}
        animal.visual=visual;animal.visualState='licensed';mesh.add(visual.root);
      }).catch(error=>{if(current===generation&&!signal.aborted){animal.visualState='unavailable';animal.error=String(error.message||error).slice(0,160);}}));
    }
    return Promise.all(pending).then(()=>undefined);
  }
  function update(delta){
    const dt=Number.isFinite(delta)?Math.max(0,Math.min(.1,delta)):0;time+=dt;
    for(const animal of oceanMode.cetaceans||[]){
      const {mesh,units,radius}=animal,p=mesh.position;
      const angle=(time+4)*.07+animal.orbitPhase;
      const x=(35+Math.cos(angle)*35)/units,z=(45+Math.sin(angle)*35)/units;
      const water=dolphinWaterEnvelope(sampleWater(p.x,p.z));
      if(!water){mesh.visible=false;continue;}
      const desiredY=water.surfaceY-dolphinTargetDepth(time,animal.phase)/units;
      const heading=Math.atan2(x-p.x,z-p.z),step=animal.speedMeters*dt/units;
      const dy=Math.max(-step*.45,Math.min(step*.45,desiredY-p.y));
      let next=null;
      for(const turn of [0,.45,-.45,.9,-.9,1.5,-1.5,Math.PI]){
        const candidate={x:p.x+Math.sin(heading+turn)*step,y:p.y+dy,z:p.z+Math.cos(heading+turn)*step};
        if(valid(candidate,radius)){next=candidate;break;}
      }
      if(next&&step>0){
        target.set(next.x,next.y,next.z);look.position.copy(p);look.lookAt(target);
        // Limit visual turning; movement never jumps to a new orbit position.
        mesh.quaternion.rotateTowards(look.quaternion,dt*1.4);p.copy(target);
      }
      mesh.visible=animal.visualState==='licensed'&&valid(p,radius);
      animal.visual?.update(dt);
    }
  }
  return {init,clear,update};
}
