// Spend the existing vertex budget around contact points; a uniform horizon-wide
// grid left hundreds of metres between vertices beneath the boat.
export function waterPatchCoordinate(index,segments,radius) {
  const t=(index/segments)*2-1;
  const core=Math.min(32,radius*.25),amount=Math.abs(t);
  return Math.sign(t)*(amount<=.5 ? amount*2*core : core+Math.pow((amount-.5)*2,3)*(radius-core));
}
export function createWaterPatchGeometry(Three,radius,segments=128) {
  const geometry=new Three.PlaneGeometry(1,1,segments,segments);
  geometry.rotateX(-Math.PI/2);
  const positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
    const col=i%(segments+1),row=Math.floor(i/(segments+1));
    positions.setXYZ(i,waterPatchCoordinate(col,segments,radius),0,waterPatchCoordinate(row,segments,radius));
  }
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  geometry.userData.waterPatchRadius=radius;
  return geometry;
}
