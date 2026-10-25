import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';

// Body-anchored controls can be reached by looking at them. A head-locked
// button would continually move away from a gaze ray and could never be hit.
export function createVrGazeControls({THREE,scene,worldUnitsPerMeter,onAction,documentRef=document}){
  const scope=createLifecycleScope('vr-gaze-controls'),root=new THREE.Group(),reticle=new THREE.Mesh(new THREE.RingGeometry(.003,.005,24),new THREE.MeshBasicMaterial({color:0xeaf4ff,depthTest:false,depthWrite:false,toneMapped:false}));
  const units=worldUnitsPerMeter;root.scale.setScalar(units);reticle.scale.setScalar(units);reticle.renderOrder=10002;
  const geometry=new THREE.PlaneGeometry(.37,.15),raycaster=new THREE.Raycaster(),direction=new THREE.Vector3(),point=new THREE.Vector3();
  scope.defer(()=>geometry.dispose(),'geometry');scope.defer(()=>reticle.geometry.dispose(),'geometry');scope.defer(()=>reticle.material.dispose(),'material');
  const controls=[['toggle','Start'],['recenter','Recenter'],['exit','Exit VR']].map(([action,text],index)=>{
    const canvas=documentRef.createElement('canvas');canvas.width=384;canvas.height=160;
    const texture=new THREE.CanvasTexture(canvas),material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
    scope.defer(()=>texture.dispose(),'texture');scope.defer(()=>material.dispose(),'material');
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set((index-1)*.43,-.34,-1.5);mesh.renderOrder=10001;mesh.userData.action=action;
    function label(text){const draw=canvas.getContext('2d');draw.clearRect(0,0,384,160);draw.fillStyle='#102b45';draw.fillRect(2,2,380,156);draw.strokeStyle='#5ac8ff';draw.lineWidth=4;draw.strokeRect(3,3,378,154);draw.font='600 36px system-ui';draw.textAlign='center';draw.textBaseline='middle';draw.fillStyle='#eaf4ff';draw.fillText(text,192,80);texture.needsUpdate=true;}
    label(text);root.add(mesh);return {mesh,label};
  });
  const meshes=controls.map(row=>row.mesh);root.visible=false;reticle.visible=false;
  scene.add(root,reticle);scope.defer(()=>{scene.remove(root,reticle);root.clear();},'scene-objects');
  let hover=null,since=0,latched=false,disposed=false,lastLabel='Start';
  function reset(){hover=null;since=0;latched=false;reticle.material.color.setHex(0xeaf4ff);reticle.scale.setScalar(units);}
  return Object.freeze({
    update({mountPosition,mountQuaternion,camera,timestamp,paused,tracking}){
      if(disposed)return;root.visible=true;reticle.visible=true;root.position.copy(mountPosition);root.quaternion.copy(mountQuaternion);root.updateMatrixWorld(true);
      direction.set(0,0,-1).applyQuaternion(camera.quaternion);raycaster.ray.set(camera.position,direction);
      const hit=raycaster.intersectObjects(meshes,false)[0];
      point.copy(hit?.point||camera.position).addScaledVector(direction,hit?-.002:1.5*units);
      reticle.position.copy(point);reticle.quaternion.copy(camera.quaternion);
      const label=!tracking?'Waiting for motion':paused?'Start':'Pause';if(label!==lastLabel){controls[0].label(label);lastLabel=label;}
      const next=tracking?hit?.object?.userData.action:null;
      if(next!==hover){reset();hover=next;since=timestamp;}
      if(!next)return;const progress=Math.max(0,Math.min(1,(timestamp-since)/1100));reticle.material.color.setHex(progress>=1?0x59d39c:0xffc857);reticle.scale.setScalar(units*(1+progress*.4));
      if(progress>=1&&!latched){latched=true;onAction(next);}
    },
    reset,
    select(){if(hover&&!latched&&!disposed){latched=true;onAction(hover);return true;}return false;},
    dispose(){if(disposed)return;disposed=true;scope.dispose('VR controls ended');}
  });
}
