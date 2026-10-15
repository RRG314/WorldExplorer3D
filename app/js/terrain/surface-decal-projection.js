// Clip a convex marking polygon to published road triangles before assigning height.
// Every output face is coplanar with its support, including terrain folds.
export function projectDecalPolygon(points, supports, lift = .012, workspace) {
  // Keep scratch capacity between supporting triangles. A caller-owned
  // workspace also reuses Float64 output storage; its returned view is borrowed.
  // Ordinary callers still receive an independent array with the same values.
  let output=workspace ? (workspace.output instanceof Float64Array ? workspace.output : new Float64Array(128)) : [];
  let outputCount=0;
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const point of points){minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minZ=Math.min(minZ,point.z);maxZ=Math.max(maxZ,point.z);}
  // Scratch storage belongs to this call. Reuse it across supporting triangles;
  // returned vertices never alias it, and nested/concurrent callers share nothing.
  let poly=workspace?.poly || [],next=workspace?.next || [];
  for(const t of supports){
    const p=t.positions;
    const ax=p[t.a],az=p[t.a+2],bx=p[t.b],bz=p[t.b+2],cx=p[t.c],cz=p[t.c+2];
    const supportArea=(bx-ax)*(cz-az)-(bz-az)*(cx-ax);
    if(Math.abs(supportArea)<1e-9)continue;
    // Preserve the existing clipping tolerance, including very thin faces.
    const marginX=1e-9*(Math.abs(bx-ax)+Math.abs(cx-bx)+Math.abs(ax-cx))/Math.abs(supportArea);
    const marginZ=1e-9*(Math.abs(bz-az)+Math.abs(cz-bz)+Math.abs(az-cz))/Math.abs(supportArea);
    if(maxX<Math.min(ax,bx,cx)-marginX || minX>Math.max(ax,bx,cx)+marginX ||
       maxZ<Math.min(az,bz,cz)-marginZ || minZ>Math.max(az,bz,cz)+marginZ)continue;
    const ay=p[t.a+1],by=p[t.b+1],cy=p[t.c+1],sign=Math.sign(supportArea);
    let polyCount=0;
    for(const q of points){poly[polyCount++]=q.x;poly[polyCount++]=q.z;}
    for(let i=0;i<3&&polyCount;i++){
      const ux=i===0?ax:i===1?bx:cx,uz=i===0?az:i===1?bz:cz;
      const vx=i===0?bx:i===1?cx:ax,vz=i===0?bz:i===1?cz:az;
      let nextCount=0;
      for(let j=0;j<polyCount;j+=2){
        const k=(j+2)%polyCount,qx=poly[j],qz=poly[j+1],rx=poly[k],rz=poly[k+1];
        const dq=sign*((vx-ux)*(qz-uz)-(vz-uz)*(qx-ux));
        const dr=sign*((vx-ux)*(rz-uz)-(vz-uz)*(rx-ux));
        const insideQ=dq>=-1e-9,insideR=dr>=-1e-9;
        if(insideQ){next[nextCount++]=qx;next[nextCount++]=qz;}
        if(insideQ!==insideR){const f=dq/(dq-dr);next[nextCount++]=qx+(rx-qx)*f;next[nextCount++]=qz+(rz-qz)*f;}
      }
      const previous=poly;poly=next;next=previous;polyCount=nextCount;
    }
    for(let i=2;i+3<polyCount;i+=2){
      const signedArea=(poly[i]-poly[0])*(poly[i+3]-poly[1])-(poly[i+1]-poly[1])*(poly[i+2]-poly[0]);
      if(Math.abs(signedArea)<1e-9)continue;
      if(workspace && outputCount+9>output.length){
        let capacity=Math.max(128,output.length);while(capacity<outputCount+9)capacity*=2;
        const grown=new Float64Array(capacity);grown.set(output);output=grown;
      }
      for(let vertex=0;vertex<3;vertex++){
        const index=vertex===0?0:signedArea>0?(vertex===1?i+2:i):(vertex===1?i:i+2);
        const x=poly[index],z=poly[index+1];
        const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/t.denominator;
        const v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/t.denominator;
        output[outputCount++]=x;output[outputCount++]=u*ay+v*by+(1-u-v)*cy+lift;output[outputCount++]=z;
      }
    }
  }
  if(workspace){workspace.output=output;return output.subarray(0,outputCount);}
  return output;
}

export const projectDecalTriangle = projectDecalPolygon;
