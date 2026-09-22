// Clip a convex marking polygon to published road triangles before assigning height.
// Every output face is coplanar with its support, including terrain folds.
export function projectDecalPolygon(points, supports, lift = .012) {
  const output=[];
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
  const minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
  for(const t of supports){
    const p=t.positions;
    const ax=p[t.a],az=p[t.a+2],bx=p[t.b],bz=p[t.b+2],cx=p[t.c],cz=p[t.c+2];
    const supportArea=(bx-ax)*(cz-az)-(bz-az)*(cx-ax);
    if(Math.abs(supportArea)<1e-9)continue;
    // The clipping half-planes include a 1e-9 tolerance. Expand the bounds
    // by the corresponding worst vertex displacement, including thin faces,
    // so this broad-phase rejection cannot remove accepted seam fragments.
    const marginX=1e-9*(Math.abs(bx-ax)+Math.abs(cx-bx)+Math.abs(ax-cx))/Math.abs(supportArea);
    const marginZ=1e-9*(Math.abs(bz-az)+Math.abs(cz-bz)+Math.abs(az-cz))/Math.abs(supportArea);
    if(maxX<Math.min(ax,bx,cx)-marginX || minX>Math.max(ax,bx,cx)+marginX ||
       maxZ<Math.min(az,bz,cz)-marginZ || minZ>Math.max(az,bz,cz)+marginZ)continue;
    const corners=[t.a,t.b,t.c].map(i=>({x:p[i],y:p[i+1],z:p[i+2]}));
    const [a,b,c]=corners;
    const area=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
    if(Math.abs(area)<1e-9)continue;
    const sign=Math.sign(area);
    let poly=points.map(q=>({x:q.x,z:q.z}));
    for(let i=0;i<3&&poly.length;i++){
      const u=corners[i],v=corners[(i+1)%3],next=[];
      const side=q=>sign*((v.x-u.x)*(q.z-u.z)-(v.z-u.z)*(q.x-u.x));
      for(let j=0;j<poly.length;j++){
        const q=poly[j],r=poly[(j+1)%poly.length],dq=side(q),dr=side(r),insideQ=dq>=-1e-9,insideR=dr>=-1e-9;
        if(insideQ)next.push(q);
        if(insideQ!==insideR){const f=dq/(dq-dr);next.push({x:q.x+(r.x-q.x)*f,z:q.z+(r.z-q.z)*f});}
      }
      poly=next;
    }
    const height=q=>{
      const u=((b.z-c.z)*(q.x-c.x)+(c.x-b.x)*(q.z-c.z))/t.denominator;
      const v=((c.z-a.z)*(q.x-c.x)+(a.x-c.x)*(q.z-c.z))/t.denominator;
      return u*a.y+v*b.y+(1-u-v)*c.y+lift;
    };
    for(let i=1;i+1<poly.length;i++){
      const [q,r,s]=[poly[0],poly[i],poly[i+1]];
      const signedArea=(r.x-q.x)*(s.z-q.z)-(r.z-q.z)*(s.x-q.x);
      if(Math.abs(signedArea)<1e-9)continue;
      const ordered=signedArea>0?[q,s,r]:[q,r,s];
      for(const v of ordered)output.push(v.x,height(v),v.z);
    }
  }
  return output;
}

// Retain the triangle entry point for existing surface callers.
export const projectDecalTriangle = projectDecalPolygon;
