import {terrainGridInterval} from '../terrain/world-grid.js';
import {createRoadContactIndex,createRoadContactIndexCooperatively} from '../terrain/road-contact-index.js?v=1';
import {projectDecalTriangle} from '../terrain/surface-decal-projection.js';

// Split against the rendered terrain planes. This preserves creases exactly
// without recursively multiplying skinny pavement triangles near a grid edge.
export function createPavementTerrainPartition(meshes = [], {includeFarTerrain = false,farSupportIndex} = {}) {
  const farMeshes=includeFarTerrain ? meshes.filter(m=>m.visible!==false && m.userData?.isFarTerrainClipmap) : [];
  const farIndex=farSupportIndex ?? (farMeshes.length ? createRoadContactIndex(farMeshes,320) : null);
  const grids=[];
  for(const mesh of meshes){
    if(!mesh.userData?.isTerrainMesh || mesh.visible===false || mesh.userData.pendingTerrainTile)continue;
    const source=mesh.geometry?.attributes?.position,segments=mesh.geometry?.parameters?.widthSegments;
    if(!source || !Number.isInteger(segments)||segments<1)continue;
    // Near tiles use local Float32 vertices plus a translated origin; the far
    // mesh uses world Float32 vertices. Canonicalize both to the render grid
    // before clipping, otherwise the same boundary differs by a fraction of a
    // millimetre and becomes an apparent missing/overlapping support strip.
    const array=new Float32Array(source.array.length);
    for(let i=0;i<array.length;i+=3){array[i]=source.array[i]+mesh.position.x;array[i+1]=source.array[i+1]+(mesh.position.y || 0);array[i+2]=source.array[i+2]+mesh.position.z;}
    const p={array},stride=segments+1,ox=0,oz=0;
    const minX=array[0],maxX=array[segments*3],minZ=array[2],maxZ=array[segments*stride*3+2];
    if(!(maxX>minX&&maxZ>minZ))continue;
    grids.push({p,segments,stride,ox,oz,minX,maxX,minZ,maxZ,dx:(maxX-minX)/segments,dz:(maxZ-minZ)/segments});
  }
  function* partitionSteps(vertices,sampleTop){
    const output=[];let sourceArea=0,coveredArea=0,worstTriangle=null;
    for(let i=0;i<vertices.length;i+=9){
      const world=[0,3,6].map(j=>({x:vertices[i+j],z:vertices[i+j+2]}));
      const area=Math.abs((world[1].x-world[0].x)*(world[2].z-world[0].z)-(world[1].z-world[0].z)*(world[2].x-world[0].x))/2;
      sourceArea+=area;if(area<1e-9)continue;
      const areaBefore=coveredArea;const contributions=[];
      const minX=Math.min(...world.map(p=>p.x)),maxX=Math.max(...world.map(p=>p.x)),minZ=Math.min(...world.map(p=>p.z)),maxZ=Math.max(...world.map(p=>p.z));
      for(const g of grids){
        if(maxX<=g.minX+g.ox||minX>=g.maxX+g.ox||maxZ<=g.minZ+g.oz||minZ>=g.maxZ+g.oz)continue;
        const points=world.map(p=>({x:p.x-g.ox,z:p.z-g.oz})),supports=[];
        const col0=terrainGridInterval(g.p.array,g.segments,3,0,minX-g.ox),col1=terrainGridInterval(g.p.array,g.segments,3,0,maxX-g.ox);
        const row0=terrainGridInterval(g.p.array,g.segments,g.stride*3,2,minZ-g.oz),row1=terrainGridInterval(g.p.array,g.segments,g.stride*3,2,maxZ-g.oz);
        for(let row=row0;row<=row1;row++)for(let col=col0;col<=col1;col++){
          const a=row*g.stride+col,b=a+1,c=a+g.stride,d=c+1;
          for(const ids of [[a,c,b],[b,c,d]]){
            const [ia,ib,ic]=ids.map(n=>n*3),p=g.p.array;
            const denominator=(p[ib+2]-p[ic+2])*(p[ia]-p[ic])+(p[ic]-p[ib])*(p[ia+2]-p[ic+2]);
            supports.push({positions:p,a:ia,b:ib,c:ic,denominator});
          }
        }
        const clipped=projectDecalTriangle(points,supports,0);
        contributions.push({kind:"near",vertices:clipped});
        for(let j=0;j<clipped.length;j+=9){
          coveredArea+=Math.abs((clipped[j+3]-clipped[j])*(clipped[j+8]-clipped[j+2])-(clipped[j+5]-clipped[j+2])*(clipped[j+6]-clipped[j]))/2;
          for(let k=j;k<j+9;k+=3){const x=clipped[k]+g.ox,z=clipped[k+2]+g.oz;output.push(x,sampleTop(x,z),z);}
        }
      }
      if(farIndex) {
        const clipped=farIndex.projectTriangle(world,0);
        contributions.push({kind:"far",vertices:clipped});
        for(let j=0;j<clipped.length;j+=9) {
          coveredArea+=Math.abs((clipped[j+3]-clipped[j])*(clipped[j+8]-clipped[j+2])-(clipped[j+5]-clipped[j+2])*(clipped[j+6]-clipped[j]))/2;
          for(let k=j;k<j+9;k+=3)output.push(clipped[k],sampleTop(clipped[k],clipped[k+2]),clipped[k+2]);
        }
      }
      const difference=coveredArea-areaBefore-area;
      if(Math.abs(difference)>Math.abs(worstTriangle?.difference || 0))worstTriangle={source:world,area,difference,contributions};
      yield;
    }
    // Do not delete pavement outside the detailed grid or over a missing tile.
    partition.lastCoverage={sourceArea,coveredArea,difference:coveredArea-sourceArea};
    if(Math.abs(coveredArea-sourceArea)>Math.max(1e-5,sourceArea*1e-6))partition.lastCoverage.worstTriangle=worstTriangle;
    return Math.abs(coveredArea-sourceArea)<=Math.max(1e-5,sourceArea*1e-6) ? output : null;
  };
  const partition=(vertices,sampleTop)=>{
    const steps=partitionSteps(vertices,sampleTop);let step;
    do{step=steps.next();}while(!step.done);
    return step.value;
  };
  partition.steps=partitionSteps;
  partition.dispose=()=>{farIndex?.dispose();grids.length=0;};
  return partition;
}

export async function createPavementTerrainPartitionCooperatively(meshes=[],options={}) {
  const far=options.includeFarTerrain ? meshes.filter(m=>m.visible!==false && m.userData?.isFarTerrainClipmap) : [];
  const farSupportIndex=far.length ? await createRoadContactIndexCooperatively(far,320,options) : null;
  try {
    if(options.current?.()===false)throw new Error('Terrain support construction superseded');
    return createPavementTerrainPartition(meshes,{...options,farSupportIndex});
  } catch(error){farSupportIndex?.dispose();throw error;}
}
