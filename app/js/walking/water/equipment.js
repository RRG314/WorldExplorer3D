// Small owned equipment meshes follow the existing avatar; no inventory grants.
export function setSwimmingEquipment(THREE,host,equipped) {
  let gear=host.userData.swimmingEquipment;
  if(!gear && equipped && THREE) {
    gear=new THREE.Group();gear.name='Automatic exploration scuba';
    const dark=new THREE.MeshStandardMaterial({color:0x142a35,roughness:.7});
    const tank=new THREE.MeshStandardMaterial({color:0xc3d6d9,metalness:.6,roughness:.32});
    const accent=new THREE.MeshStandardMaterial({color:0xeab23c,roughness:.5});
    const lens=new THREE.MeshStandardMaterial({color:0x2bd0df,transparent:true,opacity:.65,roughness:.18});
    const add=(geometry,material,x,y,z)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);gear.add(mesh);return mesh};
    add(new THREE.CylinderGeometry(.13,.13,.58,12),tank,0,1.12,-.24);
    add(new THREE.SphereGeometry(.13,12,8),tank,0,1.41,-.24);
    add(new THREE.SphereGeometry(.13,12,8),tank,0,.83,-.24);
    add(new THREE.CylinderGeometry(.04,.04,.1,8),accent,0,1.52,-.24);
    for(const y of [.99,1.26])add(new THREE.BoxGeometry(.36,.055,.48),dark,0,y,-.055);
    add(new THREE.BoxGeometry(.29,.12,.07),dark,0,1.58,.13);
    add(new THREE.BoxGeometry(.24,.075,.075),lens,0,1.59,.145);
    add(new THREE.CylinderGeometry(.05,.05,.08,10),dark,0,1.46,.15).rotation.x=Math.PI/2;
    const hose=new THREE.CatmullRomCurve3([new THREE.Vector3(0,1.48,-.24),new THREE.Vector3(.28,1.35,-.12),new THREE.Vector3(.23,1.42,.2),new THREE.Vector3(0,1.46,.2)]);
    add(new THREE.TubeGeometry(hose,18,.016,6,false),dark,0,0,0);
    host.add(gear);host.userData.swimmingEquipment=gear;
  }
  if(gear)gear.visible=equipped;
}

export function disposeSwimmingEquipment(host) {
  const gear=host?.userData?.swimmingEquipment;
  if(!gear)return;
  const materials=new Set();
  gear.traverse(node=>{node.geometry?.dispose();if(node.material)materials.add(node.material)});
  materials.forEach(material=>material.dispose());gear.parent?.remove(gear);
  delete host.userData.swimmingEquipment;
}
