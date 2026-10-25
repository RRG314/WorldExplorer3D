// Three r128's default stereo union assumes parallel eyes and metre-sized
// world units. Convert each runtime view explicitly, retaining normal WU view
// matrices for the game's lighting/materials and leaving actors untouched.
export function createXrWorldViews({THREE,worldUnitsPerMeter}){
  const units=worldUnitsPerMeter;
  if(!Number.isFinite(units)||units<=0)throw new TypeError('XR requires a physical world scale.');
  const local=new THREE.Matrix4(),head=new THREE.Matrix4(),position=new THREE.Vector3(),headPosition=new THREE.Vector3(),back=new THREE.Vector3();
  const corners=Array.from({length:16},()=>new THREE.Vector3()),box=new THREE.Box3();
  const matrixValid=value=>{if(value?.length!==16)return false;for(let i=0;i<16;i++)if(!Number.isFinite(value[i]))return false;return true;};
  function update({arrayCamera,pose,mountMatrix}){
    if(!arrayCamera?.isArrayCamera||!pose?.views?.length||pose.views.length>2||arrayCamera.cameras.length!==pose.views.length||
      !matrixValid(pose.transform?.matrix)||!matrixValid(mountMatrix?.elements)||
      !pose.views.every(view=>matrixValid(view.transform?.matrix)&&matrixValid(view.projectionMatrix)))throw new TypeError('XR views are unavailable or unsupported.');
    const m=mountMatrix.elements;
    if([m[3],m[7],m[11],m[15]-1].some(value=>Math.abs(value)>1e-6))throw new TypeError('XR mounts require an affine transform.');
    for(const offset of [0,4,8])if(Math.abs(Math.hypot(m[offset],m[offset+1],m[offset+2])-1)>1e-5)throw new TypeError('XR mounts use world positions and unit rotation, without scene scaling.');
    if(Math.abs(mountMatrix.determinant()-1)>1e-5)throw new TypeError('Invalid XR mount transform.');
    head.fromArray(pose.transform.matrix);head.elements[12]*=units;head.elements[13]*=units;head.elements[14]*=units;
    head.premultiply(mountMatrix);headPosition.setFromMatrixPosition(head);
    let setback=0,count=0;
    for(let index=0;index<pose.views.length;index++){
      const view=pose.views[index],eye=arrayCamera.cameras[index];
      local.fromArray(view.transform.matrix);local.elements[12]*=units;local.elements[13]*=units;local.elements[14]*=units;
      eye.matrixWorld.multiplyMatrices(mountMatrix,local);eye.matrixWorldInverse.copy(eye.matrixWorld).invert();
      eye.projectionMatrix.fromArray(view.projectionMatrix);eye.projectionMatrix.elements[14]*=units;
      eye.projectionMatrixInverse.copy(eye.projectionMatrix).invert();
      eye.matrixWorld.decompose(eye.position,eye.quaternion,eye.scale);
      const p=eye.projectionMatrix.elements;eye.near=p[14]/(p[10]-1);eye.far=p[14]/(p[10]+1);
      if(!(eye.near>0&&Number.isFinite(eye.far)&&eye.far>eye.near))throw new TypeError('XR requires a finite admitted viewing range.');
      position.setFromMatrixPosition(eye.matrixWorld);setback=Math.max(setback,position.distanceTo(headPosition));
      for(const z of [-1,1])for(const y of [-1,1])for(const x of [-1,1])corners[count++].set(x,y,z).applyMatrix4(eye.projectionMatrixInverse).applyMatrix4(eye.matrixWorld);
    }
    // This is a culling camera only. A small backward offset contains the eye
    // origins without making its near-field FOV unnecessarily wide. Rendering
    // still uses each unmodified runtime eye orientation and asymmetric FOV.
    arrayCamera.matrixWorld.copy(head);
    back.set(0,0,setback*2+.01*units).transformDirection(head).multiplyScalar(setback*2+.01*units);
    arrayCamera.matrixWorld.setPosition(position.copy(headPosition).add(back));
    arrayCamera.matrixWorldInverse.copy(arrayCamera.matrixWorld).invert();
    arrayCamera.matrixWorld.decompose(arrayCamera.position,arrayCamera.quaternion,arrayCamera.scale);
    let near=Infinity,far=0,left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity,forward=true;
    box.makeEmpty();
    for(let index=0;index<count;index++){
      const point=corners[index].applyMatrix4(arrayCamera.matrixWorldInverse),depth=-point.z;
      box.expandByPoint(point);near=Math.min(near,depth);far=Math.max(far,depth);
      if(depth<=0){forward=false;continue;}
      left=Math.min(left,point.x/depth);right=Math.max(right,point.x/depth);bottom=Math.min(bottom,point.y/depth);top=Math.max(top,point.y/depth);
    }
    if(forward){
      near*=.999;far*=1.001;
      arrayCamera.projectionMatrix.makePerspective((left-1e-5)*near,(right+1e-5)*near,(top+1e-5)*near,(bottom-1e-5)*near,near,far);
    }else{
      // Extremely canted/wide views may cross the head's rear plane. A bounded
      // orthographic cull encloses them; each actual eye remains perspective.
      box.expandByScalar(.001*units);near=-box.max.z;far=-box.min.z;
      arrayCamera.projectionMatrix.makeOrthographic(box.min.x,box.max.x,box.max.y,box.min.y,near,far);
    }
    arrayCamera.near=near;arrayCamera.far=far;arrayCamera.projectionMatrixInverse.copy(arrayCamera.projectionMatrix).invert();
    return arrayCamera;
  }
  return Object.freeze({update});
}
