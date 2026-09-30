// Convex roof surfaces are the lower envelope of bounded planar slopes.
// Each face is clipped against the other slopes, so no diagonal ridge fans
// cross the footprint. Callers validate footprint complexity before entry.
function clip(polygon, plane) {
  const result = [];
  const distance = p => plane.x * p.x + plane.z * p.z + plane.c;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = distance(a), db = distance(b);
    if (da <= 1e-8) result.push(a);
    if ((da < -1e-8 && db > 1e-8) || (da > 1e-8 && db < -1e-8)) {
      const t = da / (da - db);
      result.push({x:a.x + (b.x-a.x)*t, z:a.z + (b.z-a.z)*t});
    }
  }
  return result;
}

export function roofPlaneTriangles(points, shape, height, axis) {
  const across = {x:-axis.z,z:axis.x};
  const alongs = points.map(p=>p.x*axis.x+p.z*axis.z);
  const crosses = points.map(p=>p.x*across.x+p.z*across.z);
  const minA=Math.min(...alongs), maxA=Math.max(...alongs);
  const minC=Math.min(...crosses), maxC=Math.max(...crosses);
  const halfC=(maxC-minC)/2;
  if (!(halfC > .01 && maxA-minA > .01 && height > 0)) return [];
  const planes=[];
  const slope=(direction, min, max, rate, offset=0)=>{
    planes.push({x:direction.x*rate,z:direction.z*rate,c:offset-min*rate});
    planes.push({x:-direction.x*rate,z:-direction.z*rate,c:offset+max*rate});
  };
  if (shape === 'hipped' || shape === 'mansard') {
    let area=0;
    for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.z-b.x*a.z;}
    const sign=Math.sign(area);
    const edges=points.map((a,i)=>{
      const b=points[(i+1)%points.length],length=Math.hypot(b.x-a.x,b.z-a.z);
      const x=-(b.z-a.z)/length*sign,z=(b.x-a.x)/length*sign;
      return {x,z,c:-x*a.x-z*a.z};
    });
    // Find the convex footprint's inradius so irregular hips still honour
    // the measured maximum height rather than using a vertex-average centre.
    let low=0,high=Math.min(maxA-minA,maxC-minC)/2;
    for(let step=0;step<30;step++){
      const distance=(low+high)/2;let polygon=points;
      for(const edge of edges){polygon=clip(polygon,{x:-edge.x,z:-edge.z,c:distance-edge.c});if(polygon.length<3)break;}
      if(polygon.length>=3)low=distance;else high=distance;
    }
    const inset=high;
    if (!(inset > .01)) return [];
    const rate=height/(inset*(shape==='mansard'?.38:1));
    for(const edge of edges)planes.push({x:edge.x*rate,z:edge.z*rate,c:edge.c*rate});
    if(shape==='mansard')planes.push({x:0,z:0,c:height});
  } else {
    if(shape==='gambrel') {
      slope(across,minC,maxC,height*.7/(halfC*.35));
      slope(across,minC,maxC,height*.3/(halfC*.65),height*(1-.3/.65));
    } else slope(across,minC,maxC,height/halfC);
    if(shape==='half-hipped') slope(axis,minA,maxA,height/halfC,height*.5);
  }
  const value=(plane,p)=>plane.x*p.x+plane.z*p.z+plane.c;
  const positions=[];
  function triangle(a,b,c){
    const cross=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
    if(Math.abs(cross)<1e-8 && Math.max(a.y,b.y,c.y)-Math.min(a.y,b.y,c.y)<1e-8)return;
    positions.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
  }
  for(let i=0;i<planes.length;i++) {
    const plane=planes[i];let polygon=points;
    for(let j=0;j<planes.length&&polygon.length>=3;j++)if(i!==j){
      const other=planes[j];polygon=clip(polygon,{x:plane.x-other.x,z:plane.z-other.z,c:plane.c-other.c});
    }
    const vertices=polygon.map(p=>({...p,y:Math.max(0,value(plane,p))}));
    for(let j=1;j+1<vertices.length;j++) triangle(vertices[0],vertices[j+1],vertices[j]);
  }
  // End gables are clipped at every slope intersection as well; without these
  // breakpoints gambrel/half-hip roofs leave holes above the wall body.
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],cuts=[0,1];
    for(let j=0;j<planes.length;j++)for(let k=j+1;k<planes.length;k++){
      const da=value(planes[j],a)-value(planes[k],a),db=value(planes[j],b)-value(planes[k],b);
      if(Math.abs(da-db)>1e-8){const t=da/(da-db);if(t>1e-7&&t<1-1e-7)cuts.push(t);}
    }
    cuts.sort((x,y)=>x-y);
    for(let j=0;j+1<cuts.length;j++){
      if(cuts[j+1]-cuts[j]<1e-7)continue;
      const at=t=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
      const p=at(cuts[j]),q=at(cuts[j+1]);
      const py=Math.max(0,Math.min(...planes.map(v=>value(v,p)))),qy=Math.max(0,Math.min(...planes.map(v=>value(v,q))));
      if(Math.max(py,qy)<1e-7)continue;
      triangle({...p,y:0},{...q,y:0},{...q,y:qy});
      triangle({...p,y:0},{...q,y:qy},{...p,y:py});
    }
  }
  return positions;
}
