// Visibility is resolved before eligibility. A short or close wall must still
// occlude a rear facade; facade angle is not a proxy for public-space ownership.
export function frontageHit(point, nx, nz, edges, minimum, maximum) {
  let best = null;
  for (const edge of edges) {
    const { a, b, extendedFrontage=0 } = edge;
    const dx = b.x - a.x, dz = b.z - a.z;
    const den = nx * dz - nz * dx;
    if (Math.abs(den) < 1e-8) continue;
    const ax = a.x - point.x, az = a.z - point.z;
    const distance = (ax * dz - az * dx) / den;
    const t = (ax * nz - az * nx) / den;
    if (t >= -1e-7 && t <= 1 + 1e-7 && distance >= -1e-7 && (!best || distance < best.distance))
      best = { edge, distance:Math.max(0,distance), maximum: Math.max(maximum, minimum + extendedFrontage) };
  }
  return best && best.edge.facadeEligible !== false && best.distance >= minimum-1e-7 && best.distance <= best.maximum+1e-7 ? best : null;
}

// Partition the source interval at every event that can change its visible
// facade or eligibility. Coordinates are relative to the source segment, so
// tile boundaries, world origin and road direction do not change the result.
export function splitFrontageIntervals(segment, edges, {nx,nz,minimumA,minimumB=minimumA,maximumA,maximumB=maximumA}) {
  const dx=segment.b.x-segment.a.x,dz=segment.b.z-segment.a.z,lengthSq=dx*dx+dz*dz;
  if(!(lengthSq>1e-12))return [];
  const cuts=new Set([0,1]),candidates=[];
  const cut=t=>{if(t>1e-10&&t<1-1e-10)cuts.add(t);};
  const minimumDelta=minimumB-minimumA,maximumDelta=maximumB-maximumA;
  for(const edge of edges){
    const project=p=>({t:((p.x-segment.a.x)*dx+(p.z-segment.a.z)*dz)/lengthSq,d:(p.x-segment.a.x)*nx+(p.z-segment.a.z)*nz});
    const a=project(edge.a),b=project(edge.b),span=b.t-a.t;
    if(Math.abs(span)<1e-10)continue;
    const start=Math.max(0,Math.min(a.t,b.t)),end=Math.min(1,Math.max(a.t,b.t));
    if(end<=start)continue;
    const slope=(b.d-a.d)/span,intercept=a.d-slope*a.t;
    const extended=edge.extendedFrontage||0;
    const reach=Math.max(maximumA,maximumB,minimumA+extended,minimumB+extended);
    if(Math.min(intercept+slope*start,intercept+slope*end)>reach+1e-7 || Math.max(intercept+slope*start,intercept+slope*end)<-1e-7)continue;
    cut(start);cut(end);
    const event=(base,delta)=>{const denominator=slope-delta;if(Math.abs(denominator)>1e-12){const t=(base-intercept)/denominator;if(t>start&&t<end)cut(t);}};
    event(0,0);event(minimumA,minimumDelta);event(maximumA,maximumDelta);event(minimumA+extended,minimumDelta);
    candidates.push({start,end,slope,intercept});
  }
  // Overlapping source footprints can exchange the nearest visible edge.
  // Split at the exchange rather than extrapolating one facade through another.
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
    const a=candidates[i],b=candidates[j],delta=a.slope-b.slope;
    if(Math.abs(delta)<1e-12)continue;
    const t=(b.intercept-a.intercept)/delta;
    if(t>Math.max(a.start,b.start)&&t<Math.min(a.end,b.end))cut(t);
  }
  const sorted=[...cuts].sort((a,b)=>a-b),at=t=>({x:segment.a.x+dx*t,z:segment.a.z+dz*t});
  return sorted.slice(1).map((end,i)=>{const start=sorted[i];return {...segment,a:at(start),b:at(end),
    wa:segment.wa+(segment.wb-segment.wa)*start,wb:segment.wa+(segment.wb-segment.wa)*end,
    frontageMinimumA:minimumA+minimumDelta*start,frontageMinimumB:minimumA+minimumDelta*end,
    frontageMaximumA:maximumA+maximumDelta*start,frontageMaximumB:maximumA+maximumDelta*end};});
}
