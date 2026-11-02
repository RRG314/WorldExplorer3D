import {loadModelAsset} from '../assets/model-asset-runtime.js?v=16';
// One scene lease for a bounded virtual course; ground, roads and buildings keep their existing owners.
export async function createGeologyPresentation(runtime,qualified,study,{signal,isCurrent=()=>true}={}){
 const T=globalThis.THREE;if(!T||!runtime.scene)throw Error('The field scene is not ready.');
 const root=new T.Group(),resources=new Set(),leases=[],proxies=[],owner=runtime.dynamicBuildingColliders;
 if(!Array.isArray(owner))throw Error('The field scene collision system is not ready.');
 let disposed=false;root.name='Virtual geology field course';
 const resource=value=>{resources.add(value);return value;};
 const material=(color,options={})=>resource(new T.MeshStandardMaterial({color,roughness:.95,metalness:0,...options}));
 const colors={granite:0xb1a99a,sandstone:0x957249,basalt:0x393e3d,mudstone:0x69614e};
 const mesh=(parent,geometry,mat,position={x:0,y:0,z:0})=>{const object=new T.Mesh(resource(geometry),mat);object.position.set(position.x,position.y,position.z);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;};
 function collider(point,hx,hz,height,id){const value={sourceBuildingId:'research-geology:'+id,collisionKind:'solid',minX:point.x-hx,maxX:point.x+hx,minZ:point.z-hz,maxZ:point.z+hz,minY:point.y,maxY:point.y+height,baseY:point.y,height};if(Array.isArray(owner)){owner.push(value);proxies.push(value);}}
 function dispose(){if(disposed)return;disposed=true;root.parent?.remove(root);for(const proxy of proxies){const index=owner.indexOf(proxy);if(index>=0)owner.splice(index,1);}for(const lease of leases)lease.dispose();for(const value of resources)value.dispose?.();signal?.removeEventListener('abort',dispose);}
 signal?.addEventListener('abort',dispose,{once:true});
 try{
  const unit=qualified.metersPerUnit;
  const texture=resource(new T.TextureLoader().load('/app/assets/textures/earth/rock_ground_diffuse.jpg',value=>{if(disposed||!isCurrent()){value.dispose();return;}value.wrapS=value.wrapT=T.RepeatWrapping;value.repeat.set(1.5,1.5);value.encoding=T.sRGBEncoding;}));
  function stone(kind,size,seed){
   const geometry=new T.SphereGeometry(1,24,16),positions=geometry.attributes.position;
   for(let i=0;i<positions.count;i++){const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),noise=.08*Math.sin(x*8+seed)*Math.cos(z*9-seed)+.04*Math.cos(y*12+x*4);positions.setXYZ(i,x*(1+noise)*size.x,y*(1+noise)*size.y,z*(1+noise)*size.z);}
   geometry.computeVertexNormals();return mesh(new T.Group(),geometry,material(colors[kind],{map:texture}));
  }
  const specimens={};
  for(const id of ['a','b']){
   const point=qualified.points[id],definition=study[id],group=new T.Group();group.position.set(point.x,point.y,point.z);root.add(group);
   if(['sandstone','mudstone'].includes(definition.model)){
    const layers=definition.model==='mudstone'?12:7;
    for(let layer=0;layer<layers;layer++){
     const geometry=new T.CylinderGeometry((2.2+.13*Math.sin(layer*3))/unit,(2.4+.11*Math.cos(layer))/unit,.32/unit,9,1);
     const stoneLayer=mesh(group,geometry,material(colors[definition.model],{map:texture,color:new T.Color(colors[definition.model]).offsetHSL(0,0,(layer%3-1)*.045)}),{x:Math.sin(layer*1.3)*.06/unit,y:(.15+layer*.29)/unit,z:Math.cos(layer*1.5)*.04/unit});stoneLayer.scale.z=.65;stoneLayer.rotation.z=.04;
    }
   }else{
    const rock=stone(definition.model,{x:2.6/unit,y:1.8/unit,z:1.9/unit},id==='a'?1:3);rock.parent.remove(rock);rock.position.y=1.25/unit;group.add(rock);
    if(definition.model==='granite'){
     const grainGeometry=resource(new T.DodecahedronGeometry(1)),dummy=new T.Object3D();
     for(let color=0;color<3;color++){
      const ids=Array.from({length:85},(_,i)=>i).filter(i=>i%3===color),batch=new T.InstancedMesh(grainGeometry,material([0x30322d,0xd6c8ba,0xbcb6a7][color]),ids.length);batch.castShadow=true;
      ids.forEach((crystal,index)=>{const a=crystal*2.39996,y=(.3+(crystal%17)/17*2.8)/unit,r=Math.sqrt(Math.max(0,1-Math.pow((y*unit-1.25)/1.8,2))),size=(.05+(crystal%5)*.012)/unit;dummy.position.set(Math.cos(a)*2.62*r/unit,y,Math.sin(a)*1.92*r/unit);dummy.rotation.set(a,a*.4,0);dummy.scale.setScalar(size);dummy.updateMatrix();batch.setMatrixAt(index,dummy.matrix);});batch.instanceMatrix.needsUpdate=true;group.add(batch);
     }
    }
   }
   collider({x:point.x,y:point.y,z:point.z},2.7/unit,2/unit,3.8/unit,'exposure-'+id);
   // The collection tray is beside the face, with space to walk around the outcrop.
   const tray=new T.Group();tray.position.set(0,.16/unit,2.25/unit);group.add(tray);
   mesh(tray,new T.BoxGeometry(1.1/unit,.12/unit,.65/unit),material(0x555d55));
   const specimen=stone(definition.model,{x:.22/unit,y:.15/unit,z:.18/unit},7);specimen.parent.remove(specimen);specimen.position.set(0,.19/unit,0);tray.add(specimen);specimens[id]=specimen;
   label(group,`EXPOSURE ${id.toUpperCase()}\n${definition.name}\nVirtual training rock`,{x:0,y:3.6/unit,z:0},3.2/unit,1.25/unit);
  }
  const table=await loadModelAsset(T,'workspace-table',{signal});leases.push(table);
  if(disposed||!isCurrent()){dispose();return null;}
  table.root.scale.multiplyScalar(1/unit);
  const point=qualified.points.bench,bounds=new T.Box3().setFromObject(table.root);table.root.position.set(point.x,point.y-bounds.min.y,point.z);root.add(table.root);collider(point,.65/unit,.5/unit,.9/unit,'bench');
  label(root,'FIELD BENCH\nCompare your labeled samples',{x:point.x,y:point.y+1.7/unit,z:point.z},3.4/unit,.9/unit);
  const benchSamples={};for(const [index,id] of ['a','b'].entries()){const specimen=stone(study[id].model,{x:.17/unit,y:.11/unit,z:.13/unit},9+index);specimen.parent.remove(specimen);specimen.position.set(point.x+(index-.5)*.4/unit,point.y+.94/unit,point.z);specimen.visible=false;root.add(specimen);benchSamples[id]=specimen;}
  const ringMaterial=resource(new T.MeshBasicMaterial({color:0xefd079,transparent:true,opacity:.8,depthWrite:false}));
  const ring=mesh(root,new T.TorusGeometry(1.4/unit,.045/unit,6,48),ringMaterial);ring.rotation.x=-Math.PI/2;
  function update(active){
   if(disposed)return;for(const id of ['a','b']){specimens[id].visible=!active?.samples?.[id];benchSamples[id].visible=!!active?.samples?.[id];}
   const target=active?.phase==='exposure-a'?'a':active?.phase==='exposure-b'?'b':active?.phase==='samples'?active.samples.a?'b':'a':'bench';
   const p=qualified.points[target];ring.position.set(p.x,p.y+.06/unit,p.z+(target==='bench'?1.2:2.9)/unit);ring.visible=active?.phase!=='complete';
  }
  runtime.scene.add(root);return {update,dispose,root};
  function label(parent,text,position,width,height){
   const canvas=document.createElement('canvas');canvas.width=768;canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#17271fe8';c.fillRect(0,0,768,256);c.strokeStyle='#efd079';c.lineWidth=6;c.strokeRect(4,4,760,248);c.textAlign='center';c.fillStyle='#f3f0e4';c.font='bold 35px system-ui';text.split('\n').forEach((line,i)=>c.fillText(line,384,58+i*65,720));
   const image=resource(new T.CanvasTexture(canvas));image.encoding=T.sRGBEncoding;
   const sprite=new T.Sprite(resource(new T.SpriteMaterial({map:image,depthTest:true,transparent:true})));sprite.position.set(position.x,position.y,position.z);sprite.scale.set(width,height,1);parent.add(sprite);
  }
 }catch(error){dispose();throw error;}
}
