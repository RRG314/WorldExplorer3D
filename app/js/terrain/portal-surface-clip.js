import {buildPortalSpatialGrid} from './portal-spatial-grid.js';
import {PORTAL_FLOOR_MARGIN} from './structure-terrain-portals.js?v=2';

// Subtract the same finite excavation used by the terrain from ground-bound
// pavement. Shader-only clipping would leave invisible driving/walking floors.
// Bridges and engineered approach surfaces must not pass through this adapter.
export function createPortalSurfaceClipper(masks = []) {
  if (!masks.length) return (positions, indices = null) => ({positions, indices});
  const grid = buildPortalSpatialGrid(masks);
  const candidates = new Set();
  const planes = masks.map(m => {
    const tx=m.tangentX,tz=m.tangentZ,along=tx*m.x+tz*m.z,across=-tz*m.x+tx*m.z;
    const g=Number(m.grade)||0,base=m.roadY-g*along;
    // All distances <= 0 are inside the removed volume.
    return [[tx,0,tz,-along-m.halfDepth],[-tx,0,-tz,along-m.halfDepth],
      [-tz,0,tx,-across-m.halfWidth],[tz,0,-tx,across-m.halfWidth],
      [g*tx,-1,g*tz,base+PORTAL_FLOOR_MARGIN],[-g*tx,1,-g*tz,-base-(Number(m.cutHeight)||6)]];
  });
  const distance=(p,q)=>p.x*q[0]+p.y*q[1]+p.z*q[2]+q[3];
  function subtract(polygon, volume) {
    // Broad rejection also preserves original vertices/indices outside cuts.
    if(volume.some(plane=>polygon.every(p=>distance(p,plane)>=0)))return [polygon];
    let inside=polygon;
    const retained=[];
    for(const plane of volume) {
      const next=[],outside=[];
      for(let i=0;i<inside.length;i++) {
        const a=inside[i],b=inside[(i+1)%inside.length],da=distance(a,plane),db=distance(b,plane);
        if(da<=0)next.push(a);
        if(da>=0)outside.push(a);
        if((da<0&&db>0)||(da>0&&db<0)) {
          const t=da/(da-db),p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
          next.push(p);outside.push(p);
        }
      }
      if(outside.length>=3)retained.push(outside);
      if(next.length<3)break;
      inside=next;
    }
    return retained;
  }
  return (positions, indices = null) => {
    const count=indices?.length??positions.length/3,output=[],outputIndices=[],sourceVertices=new Map();
    const append = point => {
      if(indices && point.index!==undefined && sourceVertices.has(point.index)) {
        outputIndices.push(sourceVertices.get(point.index));return;
      }
      const index=output.length/3;output.push(point.x,point.y,point.z);
      if(indices){outputIndices.push(index);if(point.index!==undefined)sourceVertices.set(point.index,index);}
    };
    const original = at => {const index=indices?indices[at]:at,a=index*3;return {x:positions[a],y:positions[a+1],z:positions[a+2],index};};
    const appendSource = index => {
      if(indices && sourceVertices.has(index)) {outputIndices.push(sourceVertices.get(index));return;}
      const at=index*3,next=output.length/3;output.push(positions[at],positions[at+1],positions[at+2]);
      if(indices){outputIndices.push(next);sourceVertices.set(index,next);}
    };
    let changed=false;
    for(let i=0;i<count;i+=3) {
      const ia=indices?indices[i]:i,ib=indices?indices[i+1]:i+1,ic=indices?indices[i+2]:i+2;
      const ax=positions[ia*3],ay=positions[ia*3+1],az=positions[ia*3+2];
      const bx=positions[ib*3],by=positions[ib*3+1],bz=positions[ib*3+2];
      const cx=positions[ic*3],cy=positions[ic*3+1],cz=positions[ic*3+2];
      const minX=Math.min(ax,bx,cx),maxX=Math.max(ax,bx,cx);
      const minZ=Math.min(az,bz,cz),maxZ=Math.max(az,bz,cz);
      candidates.clear();
      for(let row=Math.max(0,Math.floor(minZ/grid.cellSize)-grid.minZ);row<=Math.min(grid.height-1,Math.floor(maxZ/grid.cellSize)-grid.minZ);row++)
        for(let col=Math.max(0,Math.floor(minX/grid.cellSize)-grid.minX);col<=Math.min(grid.width-1,Math.floor(maxX/grid.cellSize)-grid.minX);col++) {
          const cell=(row*grid.width+col)*4,start=grid.lookup[cell],length=grid.lookup[cell+1];
          for(let j=0;j<length;j++)candidates.add(grid.references[(start+j)*4]);
        }
      // Most pavement triangles miss every excavation. Use the original
      // half-space rejection on source coordinates before allocating polygons.
      // If any volume might cut, preserve the full original clipping order.
      let possibleCut=false;
      for(const id of candidates) {
        let separated=false;
        for(const q of planes[id]) {
          if(ax*q[0]+ay*q[1]+az*q[2]+q[3]>=0 &&
             bx*q[0]+by*q[1]+bz*q[2]+q[3]>=0 &&
             cx*q[0]+cy*q[1]+cz*q[2]+q[3]>=0) {separated=true;break;}
        }
        if(!separated){possibleCut=true;break;}
      }
      if(!possibleCut) {
        if(changed) {
          const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
          if(!(Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)<1e-10)) {
            appendSource(ia);appendSource(ib);appendSource(ic);
          }
        }
        continue;
      }
      const triangle=[original(i),original(i+1),original(i+2)];
      let pieces=[triangle];
      for(const id of candidates) {
        const next=[];
        for(const piece of pieces)next.push(...subtract(piece,planes[id]));
        pieces=next;if(!pieces.length)break;
      }
      if(!changed && (pieces.length!==1||pieces[0]!==triangle)) {
        changed=true;
        // Most tiles never meet an excavation. Allocate replacement storage
        // only after a real cut, and retain shared source vertex indices.
        for(let j=0;j<i;j++)appendSource(indices?indices[j]:j);
      }
      if(!changed)continue;
      for(const polygon of pieces)for(let j=1;j<polygon.length-1;j++) {
        const a=polygon[0],b=polygon[j],c=polygon[j+1];
        const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
        if(Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)<1e-10)continue;
        append(a);append(b);append(c);
      }
    }
    return changed ? {positions:Float32Array.from(output),indices:indices?Uint32Array.from(outputIndices):null} : {positions,indices};
  };
}
