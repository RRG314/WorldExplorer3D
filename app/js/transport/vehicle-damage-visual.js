// Bounded cosmetic damage on leased vehicle instances. Template geometry is
// never edited. This is approximate panel crushing, not soft-body simulation.
export function createVehicleDamageVisual(THREE,host,dimensions={}) {
  const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  let source=null,parts=[],materials=[],last=-1,smoke=null,fire=null;
  const owned=[];let disposed=false;
  function releaseParts(){for(const part of parts)if(part.geometry){part.object.geometry=part.original;part.geometry.dispose();part.geometry=null;}}
  function bind(){
    const next=host.userData.curatedTrafficVehicleAttachment?.visual;
    if(next===source)return;
    releaseParts();source=next;last=-1;parts=[];const unique=new Set();
    source?.updateMatrixWorld(true);
    source?.traverse(object=>{
      if(!object.isMesh)return;
      for(const mat of (Array.isArray(object.material)?object.material:[object.material]))if(mat&&!unique.has(mat)){
        unique.add(mat);mat.userData.curatedFleetBaseColor||=`#${mat.color?.getHexString?.()||'ffffff'}`;
      }
      let wheel=false;for(let p=object;p&&p!==source;p=p.parent)if(p.userData?.transportPart)wheel=true;
      const list=Array.isArray(object.material)?object.material:[object.material];
      if(wheel||list.some(m=>m?.transparent)||!object.geometry?.attributes?.position)return;
      parts.push({object,original:object.geometry,geometry:null});
    });
    materials=[...unique];
  }
  function effects(){
    if(smoke)return;
    const texture=(flame)=>{
      const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
      const drawing=canvas.getContext('2d'),g=drawing.createRadialGradient(32,38,0,32,32,30);
      g.addColorStop(0,flame?'rgba(255,247,175,.95)':'rgba(45,49,52,.5)');
      g.addColorStop(.35,flame?'rgba(255,153,25,.8)':'rgba(59,62,65,.35)');
      g.addColorStop(1,flame?'rgba(165,35,4,0)':'rgba(80,82,85,0)');
      drawing.fillStyle=g;drawing.fillRect(0,0,64,64);return new THREE.CanvasTexture(canvas);
    };
    const smokeTexture=texture(false),fireTexture=texture(true);
    const smokeMaterial=new THREE.SpriteMaterial({map:smokeTexture,transparent:true,opacity:.55,depthWrite:false});
    const fireMaterial=new THREE.SpriteMaterial({map:fireTexture,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending});
    smoke=new THREE.Group();fire=new THREE.Group();
    for(let i=0;i<5;i++){
      const puff=new THREE.Sprite(smokeMaterial);puff.userData.phase=i/5;smoke.add(puff);
      const flame=new THREE.Sprite(fireMaterial);flame.userData.phase=i/5;fire.add(flame);
    }
    const z=Number(dimensions.length||4.5)*.3,y=Number(dimensions.height||1.5)*.55-1.12;
    smoke.position.set(0,y,z);fire.position.set(0,y,z);host.add(smoke,fire);
    owned.push(smokeTexture,fireTexture,smokeMaterial,fireMaterial);
  }
  function condition(value,damage){
    if(disposed)return;bind();if(!source||value===last)return;last=value;
    materials.forEach(mat=>mat.color?.set(mat.userData.curatedFleetBaseColor).multiplyScalar(1-damage.dirt*.25));
    // Recompute only after a condition change. Use each original vertex and
    // inverse transforms so repeated repairs/damage never compound deformation.
    const severity=Math.max(0,1-value-.16),point=new THREE.Vector3();
    source?.updateMatrixWorld(true);
    const inverseRoot=new THREE.Matrix4().copy(source.matrixWorld).invert();
    for(const part of parts){
      if(!severity&&!part.geometry)continue;
      if(!part.geometry){part.geometry=part.original.clone();part.object.geometry=part.geometry;}
      const original=part.original.attributes.position,positions=part.geometry.attributes.position;
      const toRoot=new THREE.Matrix4().multiplyMatrices(inverseRoot,part.object.matrixWorld),fromRoot=toRoot.clone().invert();
      for(let i=0;i<positions.count;i++){
        point.fromBufferAttribute(original,i).applyMatrix4(toRoot);
        const nose=Math.max(0,Math.min(1,(point.z/Number(dimensions.length||4.5)-.12)*3.2));
        const hood=Math.max(0,Math.min(1,(point.y-.25)*2));
        const crush=severity*nose*hood;
        point.z-=crush*.32;point.y-=crush*.15;
        point.applyMatrix4(fromRoot);positions.setXYZ(i,point.x,point.y,point.z);
      }
      positions.needsUpdate=true;part.geometry.computeVertexNormals();part.geometry.computeBoundingSphere();
    }
    if(damage.smoke)effects();
    if(smoke){smoke.visible=damage.smoke;fire.visible=value<=.12;}
  }
  return {condition,
    update(time){
      if(reducedMotion)time=0;
      if(!smoke?.visible)return;
      for(const puff of smoke.children){const phase=(time*.45+puff.userData.phase)%1;puff.position.set(Math.sin(phase*9)*.14,phase*1.6,0);puff.scale.setScalar(.35+phase*1.8);}
      if(fire.visible)for(const flame of fire.children){const phase=(time*1.9+flame.userData.phase)%1;flame.position.set(Math.sin(flame.userData.phase*37)*.3,phase*.65,0);flame.scale.set(.3,.5+Math.sin(time*13+phase*7)*.2,.3);}
    },
    dispose(){if(disposed)return;disposed=true;releaseParts();
      if(smoke?.parent)smoke.parent.remove(smoke);if(fire?.parent)fire.parent.remove(fire);for(const resource of owned)resource.dispose();}
  };
}
