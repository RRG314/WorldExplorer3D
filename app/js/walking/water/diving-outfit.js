// Reversible styling of the licensed rig: its own skinned body remains the
// suit, so sleeves and legs follow animation rather than floating overlays.
export function createDivingOutfit(THREE,host,gear,material) {
  const replacements=[],hidden=[],fins=[];
  const materials=new Set();
  const hostInverse=new THREE.Quaternion(),worldQuaternion=new THREE.Quaternion(),position=new THREE.Vector3();
  host.updateWorldMatrix(true,true);
  host.getWorldQuaternion(hostInverse).invert();
  host.traverse(object=>{
    if(object===gear||object.parent===gear)return;
    if(/backpack/i.test(object.name||'')){hidden.push([object,object.visible]);object.visible=false;}
    if(object.isMesh){
      let ancestor=object,part='';
      while(ancestor&&ancestor!==host){if(/Adventurer_(Body|Legs|Feet|Head)/i.test(ancestor.name||'')){part=ancestor.name;break;}ancestor=ancestor.parent;}
      if(part&&!/Head/i.test(part)){
        const previous=object.material;
        const convert=source=>{const next=source.clone();next.color?.setHex(/Gold|LightGreen/i.test(source.name)?0xdba744:0x142d3a);next.roughness=.72;next.metalness=0;materials.add(next);return next};
        object.material=Array.isArray(previous)?previous.map(convert):convert(previous);
        replacements.push([object,previous]);
      }
    }
    if(object.isBone&&/^Foot[._]?[LR]$/i.test(object.name||'')){
      const shape=new THREE.Shape();shape.moveTo(-.075,-.02);shape.lineTo(.075,-.02);shape.lineTo(.145,-.48);shape.lineTo(-.145,-.48);shape.closePath();
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:false});geometry.rotateX(-Math.PI/2);
      const fin=new THREE.Mesh(geometry,material);fin.name=`Diving fin ${object.name}`;
      object.getWorldQuaternion(worldQuaternion);
      const correction=hostInverse.clone().multiply(worldQuaternion).invert();
      fins.push({bone:object,mesh:fin,correction});
    }
  });
  fins.forEach(fin=>gear.add(fin.mesh));
  function update(){
    host.updateWorldMatrix(true,true);host.getWorldQuaternion(hostInverse).invert();
    for(const {bone,mesh,correction} of fins){
      bone.getWorldPosition(position);host.worldToLocal(position);mesh.position.copy(position);
      bone.getWorldQuaternion(worldQuaternion);mesh.quaternion.copy(hostInverse).multiply(worldQuaternion).multiply(correction);
    }
  }
  update();
  return {update,dispose(){
    replacements.forEach(([object,previous])=>{object.material=previous});hidden.forEach(([object,visible])=>{object.visible=visible});materials.forEach(value=>value.dispose());
    fins.forEach(({mesh})=>{mesh.geometry.dispose();mesh.parent?.remove(mesh)});
  }};
}
