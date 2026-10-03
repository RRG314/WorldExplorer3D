// Authored display-scale geology, never a replacement for measured terrain.
// Two instanced draws per site; existing scene owners retain/dispose the group.
export function surfaceDressingLayout({bodyId, spawn, bounds, seed = 91, kind = 'regolith'}) {
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const inside = (x,z,r) => !bounds || x-r>bounds.minX && x+r<bounds.maxX && z-r>bounds.minZ && z+r<bounds.maxZ;
  const gravel=[], formations=[];
  for(let i=0;i<1800;i++) {
    const distance=9+random()**.8*240, angle=random()*Math.PI*2;
    const x=spawn.x+Math.cos(angle)*distance,z=spawn.z+Math.sin(angle)*distance;
    const size=.035+random()**3*.19;
    if(inside(x,z,size)) gravel.push({x,z,size,yaw:random()*Math.PI*2,tone:.65+random()*.35});
  }
  // Arcs read as geological clusters, with a 55 m clear arrival/research zone.
  for(let cluster=0;cluster<18;cluster++) {
    const angle=cluster*2.39996, radius=75+random()*160;
    const cx=spawn.x+Math.cos(angle)*radius,cz=spawn.z+Math.sin(angle)*radius;
    for(let i=0;i<7;i++) {
      const x=cx+(random()-.5)*19,z=cz+(random()-.5)*19;
      const size=.7+random()**1.4*(kind==='basalt'?3.6:2.5);
      if(!inside(x,z,size*1.3)||Math.hypot(x-spawn.x,z-spawn.z)<55)continue;
      // Leave cardinal travel corridors through the clusters.
      if(Math.abs(x-spawn.x)<7||Math.abs(z-spawn.z)<7)continue;
      formations.push({id:`${bodyId}-formation-${cluster}-${i}`,x,z,size,yaw:random()*Math.PI*2,
        height:kind==='basalt'?size*(1.8+random()*2):size*(kind==='layered'?.5:.75),
        tone:.72+random()*.28,radius:size*1.15,kind:'surface-formation'});
    }
  }
  return {gravel,formations};
}

export function createSurfaceDressing(THREE, options) {
  const {bodyId,kind='regolith',sampleHeight}=options;
  const layout=surfaceDressingLayout(options);
  const root=new THREE.Group();root.name=`${bodyId} local geology`;
  root.userData={planetaryBody:bodyId,truthClass:'generated_game_detail',
    provenance:'Authored local geology and scatter; not mapped observations',
    obstacles:layout.formations.map(({id,x,z,radius,kind,height})=>({id,x,z,radius,kind,minY:sampleHeight(x,z)-1,maxY:sampleHeight(x,z)+height*1.5})),
    instanceCount:layout.gravel.length+layout.formations.length,drawBudget:2};
  const palette=kind==='basalt'?0x41464a:kind==='layered'?0xb18165:0x93918c;
  for(const [type,items] of [['gravel',layout.gravel],['formation',layout.formations]]) {
    const geometry=type==='formation'&&kind==='basalt'
      ? new THREE.CylinderGeometry(.8,1,1,6,3)
      : new THREE.IcosahedronGeometry(1,1);
    const positions=geometry.attributes.position;
    for(let i=0;i<positions.count;i++) {
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
      const rough=1+.13*Math.sin(x*13+z*9)*Math.cos(y*11);
      positions.setXYZ(i,x*rough,y*(type==='gravel'?.45:kind==='layered'?.7:1),z*rough);
    }
    geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({color:palette,roughness:.96,metalness:0});
    const mesh=new THREE.InstancedMesh(geometry,material,items.length);
    const matrix=new THREE.Object3D(),color=new THREE.Color();
    items.forEach((item,i)=>{
      const height=item.height||item.size*.45;
      matrix.position.set(item.x,sampleHeight(item.x,item.z)+height*(kind==='basalt'&&type==='formation'?.43:.42),item.z);
      matrix.rotation.set(0,item.yaw,0);matrix.scale.set(item.size,height,item.size*.85);matrix.updateMatrix();
      mesh.setMatrixAt(i,matrix.matrix);color.setRGB(item.tone,item.tone,item.tone);mesh.setColorAt(i,color);
    });
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.castShadow=type==='formation';mesh.receiveShadow=true;mesh.name=`${bodyId} ${type}`;root.add(mesh);
  }
  return root;
}
