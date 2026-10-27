import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';

// Body-anchored controls can be reached by looking at them. A head-locked
// button would continually move away from a gaze ray and could never be hit.
export function createVrGazeControls({THREE,scene,worldUnitsPerMeter,onAction,documentRef=document}){
  const style=documentRef.defaultView?.getComputedStyle(documentRef.documentElement),token=(name,fallback)=>style?.getPropertyValue(name).trim()||fallback;
  const colors={surface:token('--wx-panel-solid','#1a2727'),line:token('--wx-action','#eec96b'),text:token('--wx-text','#f5f6ed'),success:token('--wx-success','#a5d6a7')};
  const textScale=Math.max(1,Math.min(2,parseFloat(token('--wx-text-scale','1'))||1)),normalColor=new THREE.Color(colors.text).convertSRGBToLinear(),progressColor=new THREE.Color(colors.line).convertSRGBToLinear(),successColor=new THREE.Color(colors.success).convertSRGBToLinear();
  const scope=createLifecycleScope('vr-gaze-controls'),root=new THREE.Group(),reticle=new THREE.Mesh(new THREE.RingGeometry(.003,.005,24),new THREE.MeshBasicMaterial({color:normalColor,depthTest:false,depthWrite:false,toneMapped:false}));
  const units=worldUnitsPerMeter;root.scale.setScalar(units);reticle.scale.setScalar(units);reticle.renderOrder=10002;
  const geometry=new THREE.PlaneGeometry(.37,.15),raycaster=new THREE.Raycaster(),direction=new THREE.Vector3(),origin=new THREE.Vector3(),point=new THREE.Vector3(),orientation=new THREE.Quaternion();
  scope.defer(()=>geometry.dispose(),'geometry');scope.defer(()=>reticle.geometry.dispose(),'geometry');scope.defer(()=>reticle.material.dispose(),'material');
  const controls=[['toggle','Start'],['recenter','Recenter'],['exit','Exit VR']].map(([action,text],index)=>{
    const canvas=documentRef.createElement('canvas');canvas.width=384;canvas.height=160;
    const texture=new THREE.CanvasTexture(canvas),material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
    texture.encoding=THREE.sRGBEncoding;
    scope.defer(()=>texture.dispose(),'texture');scope.defer(()=>material.dispose(),'material');
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set((index-1)*.43,-.34,-1.5);mesh.renderOrder=10001;mesh.userData.action=action;
    function label(text){const draw=canvas.getContext('2d'),lines=text==='Waiting for motion'?['Waiting for','motion']:[text];draw.clearRect(0,0,384,160);draw.fillStyle=colors.surface;draw.fillRect(2,2,380,156);draw.strokeStyle=colors.line;draw.lineWidth=4;draw.strokeRect(3,3,378,154);draw.font=`600 ${Math.min(36*textScale,lines.length>1?52:72)}px system-ui`;draw.textAlign='center';draw.textBaseline='middle';draw.fillStyle=colors.text;lines.forEach((line,index)=>draw.fillText(line,192,80+(index-(lines.length-1)/2)*70,350));texture.needsUpdate=true;}
    label(text);root.add(mesh);return {mesh,label};
  });
  const meshes=controls.map(row=>row.mesh);root.visible=false;reticle.visible=false;
  const captionCanvas=documentRef.createElement('canvas');captionCanvas.width=1024;captionCanvas.height=128;
  const captionTexture=new THREE.CanvasTexture(captionCanvas),captionMaterial=new THREE.MeshBasicMaterial({map:captionTexture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}),captionGeometry=new THREE.PlaneGeometry(1.3,.16),caption=new THREE.Mesh(captionGeometry,captionMaterial);
  captionTexture.encoding=THREE.sRGBEncoding;
  caption.position.set(0,-.13,-1.5);caption.renderOrder=10001;caption.visible=false;root.add(caption);let lastMessage='';
  scope.defer(()=>captionTexture.dispose(),'texture');scope.defer(()=>captionMaterial.dispose(),'material');scope.defer(()=>captionGeometry.dispose(),'geometry');
  scene.add(root,reticle);scope.defer(()=>{scene.remove(root,reticle);root.clear();},'scene-objects');
  let hover=null,since=0,latched=false,disposed=false,lastLabel='Start';
  function reset(){hover=null;since=0;latched=false;reticle.material.color.copy(normalColor);reticle.scale.setScalar(units);}
  return Object.freeze({
    update({mountPosition,mountQuaternion,camera,timestamp,paused,tracking,message=''}){
      if(disposed)return;root.visible=true;reticle.visible=true;root.position.copy(mountPosition);root.quaternion.copy(mountQuaternion);root.updateMatrixWorld(true);
      // Ray requires a normalized world direction. Matrix decomposition can
      // leave a quaternion a few ulps off unit length; an unnormalized ray can
      // miss the shared diagonal of r128's two button triangles at its centre.
      camera.getWorldDirection(direction);camera.getWorldPosition(origin);camera.getWorldQuaternion(orientation);raycaster.ray.set(origin,direction);
      const hit=raycaster.intersectObjects(meshes,false)[0];
      point.copy(hit?.point||origin).addScaledVector(direction,hit?-.002:1.5*units);
      reticle.position.copy(point);reticle.quaternion.copy(orientation);
      const label=!tracking?'Waiting for motion':paused?'Start':'Pause';if(label!==lastLabel){controls[0].label(label);lastLabel=label;}
      caption.visible=!!message;
      if(message!==lastMessage){lastMessage=message;const draw=captionCanvas.getContext('2d');draw.clearRect(0,0,1024,128);draw.fillStyle=colors.surface;draw.fillRect(0,0,1024,128);draw.font=`600 ${38*textScale}px system-ui`;draw.fillStyle=colors.text;draw.textAlign='center';draw.textBaseline='middle';draw.fillText(String(message).slice(0,88),512,64,990);captionTexture.needsUpdate=true;}
      const next=tracking?hit?.object?.userData.action:null;
      if(next!==hover){reset();hover=next;since=timestamp;}
      if(!next)return;const progress=Math.max(0,Math.min(1,(timestamp-since)/1100));reticle.material.color.copy(progress>=1?successColor:progressColor);reticle.scale.setScalar(units*(1+progress*.4));
      if(progress>=1&&!latched){latched=true;onAction(next);}
    },
    reset,
    snapshot:()=>({hover,since,latched,visible:root.visible}),
    select(){if(hover&&!latched&&!disposed){latched=true;onAction(hover);return true;}return false;},
    selectRay(origin,direction){
      if(disposed||!root.visible)return false;
      if(![origin.x,origin.y,origin.z,direction.x,direction.y,direction.z].every(Number.isFinite)||direction.lengthSq()===0)return false;
      raycaster.ray.set(origin,direction);raycaster.ray.direction.normalize();const action=raycaster.intersectObjects(meshes,false)[0]?.object?.userData.action;
      if(!action)return false;reset();onAction(action);return true;
    },
    dispose(){if(disposed)return;disposed=true;scope.dispose('VR controls ended');scene=null;}
  });
}
