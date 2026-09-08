export function vegetationIdentitySeed(identity) {
  let value=2166136261;
  for(const character of String(identity)) value=Math.imul(value^character.charCodeAt(0),16777619);
  return value>>>0;
}

export function terrainForestAttributeWeight(attribute,index) {
  // Three r128 getZ returns raw bytes even for normalized attributes.
  const value=attribute.array ? Number(attribute.array[index*attribute.itemSize+2]||0) : Number(attribute.getZ(index)||0);
  return attribute.normalized ? value/255 : value;
}

export function* nearbyVegetationCells(bounds, spacing, limit, focus = {x:0,z:0}) {
  if (!(spacing>0) || !Number.isFinite(spacing) || !(limit>0)) return;
  const minX=Math.floor(bounds.minX/spacing), maxX=Math.floor(bounds.maxX/spacing);
  const minZ=Math.floor(bounds.minZ/spacing), maxZ=Math.floor(bounds.maxZ/spacing);
  if (![minX,maxX,minZ,maxZ].every(Number.isFinite)) return;
  const originX=Math.max(minX,Math.min(maxX,Math.floor((Number(focus.x)||0)/spacing))), originZ=Math.max(minZ,Math.min(maxZ,Math.floor((Number(focus.z)||0)/spacing)));
  const maxRing=Math.max(originX-minX,maxX-originX,originZ-minZ,maxZ-originZ);
  let count=0;
  for(let ring=0;ring<=maxRing && count<limit;ring++) {
    for(const cz of new Set([originZ-ring,originZ+ring])) {
      if(cz<minZ || cz>maxZ) continue;
      for(let cx=Math.max(minX,originX-ring);cx<=Math.min(maxX,originX+ring) && count<limit;cx++){count++;yield {cx,cz};}
    }
    for(const cx of new Set([originX-ring,originX+ring])) {
      if(cx<minX || cx>maxX) continue;
      for(let cz=Math.max(minZ,originZ-ring+1);cz<=Math.min(maxZ,originZ+ring-1) && count<limit;cz++){count++;yield {cx,cz};}
    }
  }
}

// Terrain uses a regular PlaneGeometry grid, rotated onto XZ. Sample the
// accepted material field again after jitter; a forest vertex is not evidence
// for an arbitrary neighboring point outside the tile or in a clearing.
export function semanticForestWeightAt(mesh,x,z) {
  const geometry=mesh?.geometry, params=geometry?.parameters;
  const attribute=geometry?.attributes?.terrainSurfaceMixA;
  if(!params || !attribute || !(params.width>0) || !(params.height>0)) return 0;
  const columns=params.widthSegments, rows=params.heightSegments;
  if(!columns || !rows || attribute.count!==(columns+1)*(rows+1)) return 0;
  const u=(x-Number(mesh.position?.x||0))/params.width+.5;
  const v=(z-Number(mesh.position?.z||0))/params.height+.5;
  if(u<0 || u>1 || v<0 || v>1) return 0;
  const px=u*columns, py=v*rows, x0=Math.floor(px), y0=Math.floor(py);
  const x1=Math.min(columns,x0+1), y1=Math.min(rows,y0+1), tx=px-x0, ty=py-y0;
  return terrainForestAttributeWeight(attribute,y0*(columns+1)+x0)*(1-tx)*(1-ty)
    +terrainForestAttributeWeight(attribute,y0*(columns+1)+x1)*tx*(1-ty)
    +terrainForestAttributeWeight(attribute,y1*(columns+1)+x0)*(1-tx)*ty
    +terrainForestAttributeWeight(attribute,y1*(columns+1)+x1)*tx*ty;
}
