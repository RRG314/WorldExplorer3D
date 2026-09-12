// Source-backed crossing appearance. Unknown markings remain unknown; signals
// alone do not establish paint or a lowered kerb.
export function crossingStyle(feature) {
  const tags = { ...(feature.sourceTags || {}) };
  for(const key of ['crossing','crossing:markings']) {
    if(tags[key])continue;
    const values=[...new Set((feature.crossingNodes || []).map(n=>n.tags?.[key]).filter(Boolean))];
    if(values.length===1)tags[key]=values[0];
  }
  const marking = String(tags['crossing:markings'] || '').toLowerCase();
  const legacy = String(tags.crossing || '').toLowerCase();
  const prohibited = ['no','informal'].includes(legacy);
  let paint = null;
  if (!prohibited && marking !== 'no') {
    if (['zebra','ladder','lines','yes'].includes(marking)) paint = marking === 'yes' ? 'lines' : marking;
    else if (!marking && ['zebra','marked','uncontrolled'].includes(legacy)) paint = legacy === 'zebra' ? 'zebra' : 'lines';
  }
  return {paint,kerb:prohibited ? 'raised' : String(tags.kerb || '')};
}

export function segmentIntersection(a,b,c,d) {
  const dx=b.x-a.x,dz=b.z-a.z,ex=d.x-c.x,ez=d.z-c.z;
  const den=dx*ez-dz*ex;
  if(Math.abs(den)<1e-9)return null;
  const t=((c.x-a.x)*ez-(c.z-a.z)*ex)/den;
  const u=((c.x-a.x)*dz-(c.z-a.z)*dx)/den;
  return t>=0 && t<=1 && u>=0 && u<=1 ? {x:a.x+t*dx,z:a.z+t*dz} : null;
}

export function crossingRamps(crossings,roadEdges,metersPerWorldUnit) {
  const ramps=[];
  for(const crossing of crossings) {
    const style=crossingStyle(crossing);
    for(let i=1;i<crossing.pts.length;i++) {
      const a=crossing.pts[i-1],b=crossing.pts[i],length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length<.01)continue;
      for(const edge of roadEdges) {
        const point=segmentIntersection(a,b,edge.a,edge.b);
        if(!point)continue;
        const node=(crossing.crossingNodes || []).filter(n=>Math.hypot(n.x-point.x,n.z-point.z)<2/metersPerWorldUnit).sort((n,m)=>Math.hypot(n.x-point.x,n.z-point.z)-Math.hypot(m.x-point.x,m.z-point.z))[0];
        const kerb=node?.kerb || style.kerb;
        if(!['lowered','flush','no'].includes(kerb))continue;
        ramps.push({...point,dx:(b.x-a.x)/length,dz:(b.z-a.z)/length,
          halfWidth:Math.max(.6/metersPerWorldUnit,(crossing.width || 2)/2),depth:1.5/metersPerWorldUnit});
      }
    }
  }
  return ramps;
}

export function rampCurbScale(x,z,ramps) {
  let scale=1;
  for(const r of ramps) {
    const along=Math.abs((x-r.x)*r.dx+(z-r.z)*r.dz);
    const across=Math.abs((x-r.x)*r.dz-(z-r.z)*r.dx);
    const side=Math.max(0,(across-r.halfWidth)/.5);
    scale=Math.min(scale,Math.max(side,along/r.depth));
  }
  return Math.max(0,Math.min(1,scale));
}
