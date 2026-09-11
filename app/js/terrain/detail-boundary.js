// The detailed mesh owns its edge heights. Only far cells touching those edges
// gain vertices; the rest of the regional grid keeps its existing density.
const key=(axis,value)=>`${axis}:${Math.round(value*100)}`;
export function collectDetailBoundaryLines(meshes=[]) {
  const lines=new Map();
  for(const mesh of meshes) {
    const p=mesh.geometry?.attributes?.position,n=Math.round(Math.sqrt(p?.count||0));
    if(!mesh.visible || !mesh.userData?.isTerrainMesh || mesh.userData?.isFarTerrainClipmap || mesh.userData?.pendingTerrainTile || !p || n*n!==p.count)continue;
    const point=i=>({x:p.getX(i)+mesh.position.x,z:p.getZ(i)+mesh.position.z,y:p.getY(i)+mesh.position.y});
    for(const indices of [Array.from({length:n},(_,i)=>i),Array.from({length:n},(_,i)=>(n-1)*n+i),Array.from({length:n},(_,i)=>i*n),Array.from({length:n},(_,i)=>i*n+n-1)]) {
      const points=indices.map(point),axis=Math.abs(points[0].x-points[n-1].x)<.01?'x':'z';
      const id=key(axis,points[0][axis]);
      if(!lines.has(id))lines.set(id,[]);
      lines.get(id).push(points);
    }
  }
  return lines;
}

export function detailPointsOnEdge(lines,a,b) {
  const axis=Math.abs(a.x-b.x)<.001?'x':'z',along=axis==='x'?'z':'x';
  const low=Math.min(a[along],b[along]),high=Math.max(a[along],b[along]);
  const points=[];
  for(const line of lines.get(key(axis,a[axis]))||[]) {
    const sorted=[...line].sort((p,q)=>p[along]-q[along]);
    if(sorted[0][along]>low+.02 || sorted.at(-1)[along]<high-.02)continue;
    const sample=value=>{
      for(let i=1;i<sorted.length;i++)if(value<=sorted[i][along]+.02) {
        const p=sorted[i-1],q=sorted[i],t=Math.max(0,Math.min(1,(value-p[along])/(q[along]-p[along])));
        return {x:axis==='x'?a.x:value,z:axis==='z'?a.z:value,y:p.y+(q.y-p.y)*t};
      }
      return {...sorted.at(-1),[along]:value};
    };
    points.push(sample(low),...sorted.filter(p=>p[along]>low+.02 && p[along]<high-.02).map(p=>({...p,[axis]:a[axis]})),sample(high));
    break;
  }
  return a[along]>b[along]?points.reverse():points;
}

export function triangleHeightAt(x,z,triangles) {
  for(const [a,b,c] of triangles||[]) {
    const denominator=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
    if(Math.abs(denominator)<1e-12)continue;
    const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/denominator;
    const v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/denominator;
    if(u>=-1e-7 && v>=-1e-7 && u+v<=1+1e-7)return u*a.y+v*b.y+(1-u-v)*c.y;
  }
  return null;
}

export function detailHeightAt(lines,axis,x,z) {
  const along=axis==='x'?'z':'x',value=along==='x'?x:z;
  for(const line of lines.get(key(axis,axis==='x'?x:z))||[]) {
    for(let i=1;i<line.length;i++) {
      const a=line[i-1],b=line[i],low=Math.min(a[along],b[along]),high=Math.max(a[along],b[along]);
      if(value<low-.02 || value>high+.02 || high-low<1e-9)continue;
      const t=Math.max(0,Math.min(1,(value-a[along])/(b[along]-a[along])));
      return a.y+(b.y-a.y)*t;
    }
  }
  return null;
}
