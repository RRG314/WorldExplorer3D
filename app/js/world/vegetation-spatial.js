import {triangleFieldAt} from '../terrain/detail-boundary.js';
import {terrainGridInterval} from '../terrain/world-grid.js';
import {cellFullyInsideDetailedCoverage} from '../terrain/far-field-coverage.js?v=2';

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

// Sample the published material grid after jitter. Detailed tiles bake world
// XZ coordinates into their vertices; the mesh origin is not their tile centre.
// A forest vertex alone cannot confer cover across a neighboring clearing.
export function terrainVegetationBounds(mesh,surfaceGrid){
  if(mesh?.userData?.isFarTerrainClipmap){
    const xs=surfaceGrid?.xValues,zs=surfaceGrid?.zValues;
    if(!Array.isArray(xs)||!Array.isArray(zs)||xs.length<2||zs.length<2)return null;
    return {minX:xs[0],maxX:xs.at(-1),minZ:zs[0],maxZ:zs.at(-1)};
  }
  const p=mesh?.geometry?.parameters;if(!(p?.width>0&&p.height>0))return null;
  const positions=mesh.geometry.attributes?.position;
  if(positions){
    const columns=p.widthSegments,rows=p.heightSegments;
    if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||positions.count!==(columns+1)*(rows+1))return null;
    const minX=positions.getX(0)+Number(mesh.position?.x||0),maxX=positions.getX(columns)+Number(mesh.position?.x||0),
      minZ=positions.getZ(0)+Number(mesh.position?.z||0),maxZ=positions.getZ(rows*(columns+1))+Number(mesh.position?.z||0);
    return [minX,maxX,minZ,maxZ].every(Number.isFinite)&&minX<maxX&&minZ<maxZ?{minX,maxX,minZ,maxZ}:null;
  }
  return {minX:Number(mesh.position?.x||0)-p.width/2,maxX:Number(mesh.position?.x||0)+p.width/2,
    minZ:Number(mesh.position?.z||0)-p.height/2,maxZ:Number(mesh.position?.z||0)+p.height/2};
}

export function semanticForestWeightAt(mesh,x,z,surfaceGrid){
  if(!Number.isFinite(x)||!Number.isFinite(z))return 0;
  const geometry=mesh?.geometry, params=geometry?.parameters;
  const attribute=geometry?.attributes?.terrainSurfaceMixA;
  if(mesh?.userData?.isFarTerrainClipmap){
    const bounds=terrainVegetationBounds(mesh,surfaceGrid);if(!bounds||!attribute||x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ)return 0;
    const xs=surfaceGrid.xValues,zs=surfaceGrid.zValues,columns=xs.length;
    if(attribute.count<columns*zs.length)return 0;
    const column=terrainGridInterval(xs,columns-1,1,0,x),row=terrainGridInterval(zs,zs.length-1,1,0,z);
    if(cellFullyInsideDetailedCoverage(xs[column],xs[column+1],zs[row],zs[row+1],surfaceGrid.detailedCoverage))return 0;
    const triangles=surfaceGrid.boundaryTriangles?.get(row*columns+column);
    if(triangles)return triangleFieldAt(x,z,triangles,p=>Number.isInteger(p.vertexIndex)&&p.vertexIndex>=0&&p.vertexIndex<attribute.count?terrainForestAttributeWeight(attribute,p.vertexIndex):NaN)??0;
    const a=row*columns+column,b=a+1,c=a+columns,d=c+1,u=(x-xs[column])/(xs[column+1]-xs[column]),v=(z-zs[row])/(zs[row+1]-zs[row]),
      ya=terrainForestAttributeWeight(attribute,a),yb=terrainForestAttributeWeight(attribute,b),yc=terrainForestAttributeWeight(attribute,c),yd=terrainForestAttributeWeight(attribute,d);
    // The far owner publishes these two planes; bilinear corner interpolation
    // would invent forest across a rendered clearing or detailed-tile hole.
    return u+v<=1?ya+u*(yb-ya)+v*(yc-ya):yd+(1-u)*(yc-yd)+(1-v)*(yb-yd);
  }
  if(!params || !attribute || !(params.width>0) || !(params.height>0)) return 0;
  const columns=params.widthSegments, rows=params.heightSegments;
  if(!columns || !rows || attribute.count!==(columns+1)*(rows+1)) return 0;
  const positions=geometry.attributes?.position;
  if(positions){
    const bounds=terrainVegetationBounds(mesh);if(!bounds||x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ||!positions.array)return 0;
    const localX=x-Number(mesh.position?.x||0),localZ=z-Number(mesh.position?.z||0),stride=positions.itemSize,
      column=terrainGridInterval(positions.array,columns,stride,0,localX),row=terrainGridInterval(positions.array,rows,(columns+1)*stride,2,localZ),
      a=row*(columns+1)+column,b=a+1,c=a+columns+1,d=c+1,
      u=(localX-positions.getX(a))/(positions.getX(b)-positions.getX(a)),v=(localZ-positions.getZ(a))/(positions.getZ(c)-positions.getZ(a));
    if(!Number.isFinite(u)||!Number.isFinite(v))return 0;
    const ya=terrainForestAttributeWeight(attribute,a),yb=terrainForestAttributeWeight(attribute,b),yc=terrainForestAttributeWeight(attribute,c),yd=terrainForestAttributeWeight(attribute,d);
    return u+v<=1?ya+u*(yb-ya)+v*(yc-ya):yd+(1-u)*(yc-yd)+(1-v)*(yb-yd);
  }
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
