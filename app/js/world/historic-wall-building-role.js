// A small unclassified footprint crossed or touched by a documented fortified wall is a
// fortification presentation candidate. This changes inferred appearance only;
// it does not invent an OSM historic tag or override measured dimensions.
export function applyHistoricWallBuildingRoles(buildings, landmarks) {
  const wallNodes=new Map((landmarks?.elements||[]).filter(e=>e.type==='node').map(e=>[e.id,e]));
  const segments=[];
  for(const w of landmarks?.elements||[]) {
    if(w.type!=='way'||!(w.tags?.historic==='citywalls'||w.tags?.barrier==='city_wall'))continue;
    for(let i=1;i<(w.nodes||[]).length;i++) {
      const a=wallNodes.get(w.nodes[i-1]),b=wallNodes.get(w.nodes[i]);
      if(a&&b)segments.push([a,b]);
    }
  }
  if(!segments.length)return 0;
  const nodes=new Map((buildings?.elements||[]).filter(e=>e.type==='node').map(e=>[e.id,e]));
  const cross=(a,b,c)=>(b.lon-a.lon)*(c.lat-a.lat)-(b.lat-a.lat)*(c.lon-a.lon);
  const intersects=(a,b,c,d)=>{
    if(Math.max(a.lon,b.lon)<Math.min(c.lon,d.lon)||Math.min(a.lon,b.lon)>Math.max(c.lon,d.lon)||
       Math.max(a.lat,b.lat)<Math.min(c.lat,d.lat)||Math.min(a.lat,b.lat)>Math.max(c.lat,d.lat))return false;
    return cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;
  };
  let count=0;
  for(const w of buildings?.elements||[]) {
    if(w.type!=='way'||w.tags?.building!=='yes'||w.tags?.historic||w.tags?._dedicatedLandmarkOwner)continue;
    const p=(w.nodes||[]).map(id=>nodes.get(id)).filter(Boolean);
    if(p.length<3)continue;
    const minLat=Math.min(...p.map(p=>p.lat)),maxLat=Math.max(...p.map(p=>p.lat));
    const minLon=Math.min(...p.map(p=>p.lon)),maxLon=Math.max(...p.map(p=>p.lon));
    const area=(maxLat-minLat)*(maxLon-minLon)*111320**2*Math.cos(minLat*Math.PI/180);
    if(area<=0||area>900)continue;
    // Allow 3 m for the wall's physical width and alignment between providers.
    // Distance is measured to the footprint edge, never a broad site radius.
    const latScale=111320,lonScale=latScale*Math.cos(minLat*Math.PI/180);
    const nearEdge=(q,a,b)=>{
      const dx=(b.lon-a.lon)*lonScale,dz=(b.lat-a.lat)*latScale;
      const qx=(q.lon-a.lon)*lonScale,qz=(q.lat-a.lat)*latScale;
      const t=Math.max(0,Math.min(1,(qx*dx+qz*dz)/(dx*dx+dz*dz||1)));
      return Math.hypot(qx-t*dx,qz-t*dz)<=3;
    };
    const crossed=segments.some(([a,b])=>{
      if(Math.max(a.lon,b.lon)<minLon-3/lonScale||Math.min(a.lon,b.lon)>maxLon+3/lonScale||Math.max(a.lat,b.lat)<minLat-3/latScale||Math.min(a.lat,b.lat)>maxLat+3/latScale)return false;
      return p.some((c,i)=>{const d=p[(i+1)%p.length];return intersects(a,b,c,d)||nearEdge(c,a,b)||nearEdge(d,a,b)||nearEdge(a,c,d)||nearEdge(b,c,d);});
    });
    if(crossed){w.tags._landmarkRole='fortification_tower';w.tags._landmarkRoleBasis='footprint_touches_mapped_fortified_wall';count++;}
  }
  return count;
}
