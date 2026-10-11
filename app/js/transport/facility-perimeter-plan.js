// Only mapped boundaries become physical fences. Site polygons establish
// membership; their outlines are never invented as perimeter geometry.
const SITE_TYPES = new Set(['aerodrome', 'heliport', 'port', 'harbour', 'marina']);
const CELL = 128;
const RING_ROW = 16;
const MAX_BAYS = 40000;

function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz || 1)));
  return Math.hypot(p.x-a.x-dx*t, p.z-a.z-dz*t);
}
function prepareRing(points, budget) {
  const rows = new Map();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if (![a.x, a.z, b.x, b.z].every(Number.isFinite)) return null;
    minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
    minZ = Math.min(minZ, a.z); maxZ = Math.max(maxZ, a.z);
    const first = Math.floor((Math.min(a.z, b.z) - 3) / RING_ROW);
    const last = Math.floor((Math.max(a.z, b.z) + 3) / RING_ROW);
    budget.entries += last - first + 1;
    if (budget.entries > 100000) { budget.overflow = true; return null; }
    for (let row = first; row <= last; row++) {
      if (!rows.has(row)) rows.set(row, []);
      rows.get(row).push({a, b});
    }
  }
  // Only edges intersecting this latitude can affect the ray or the small
  // boundary tolerance. A detailed airport ring is not scanned for every bay.
  return p => {
    if (p.x < minX - 3 || p.x > maxX + 3 || p.z < minZ - 3 || p.z > maxZ + 3) return false;
    let result = false;
    for (const {a, b} of rows.get(Math.floor(p.z / RING_ROW)) || []) {
      if (++budget.checks > 2000000) { budget.overflow = true; return false; }
      if (pointSegmentDistance(p, a, b) < 3) return true;
      if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) result = !result;
    }
    return result;
  };
}
function segmentsDistance(a,b,c,d) {
  const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  if (abC*abD<0 && cdA*cdB<0) return 0;
  return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}

function compileFacilityPerimeterPlan(graph) {
  const membershipBudget = {entries: 0, checks: 0, overflow: false};
  const sites = graph.records.filter(r => SITE_TYPES.has(r.type) && r.exactPhysicalGeometry && r.geometry.kind === 'polygon').map(site => {
    const outer = (site.geometry.outerRings || [site.geometry.points]).map(ring => prepareRing(ring, membershipBudget));
    const holes = (site.geometry.holes || []).map(ring => prepareRing(ring, membershipBudget));
    if ([...outer, ...holes].some(ring => !ring)) return null;
    return {id: site.id, contains: point => outer.some(inside => inside(point)) && !holes.some(inside => inside(point))};
  }).filter(Boolean);
  const fences=graph.records.filter(r=>r.type==='fence'&&r.exactPhysicalGeometry &&
    ['', 'chain_link', 'chainlink', 'metal', 'wire', 'mesh'].includes(r.attributes?.fenceType || ''));
  const gates=graph.records.filter(r=>r.type==='access_gate'&&r.geometry.complete&&r.geometryAuthority==='exact-openstreetmap');
  const corridors=[...(graph.accessCorridors || []), ...graph.records.filter(r=>['runway','taxiway'].includes(r.type)&&r.exactPhysicalGeometry)
    .map(r=>({geometry:r.geometry,width:r.attributes?.width || (r.type==='runway'?60:24)}))];
  // Index clearances once; fence admission must not compare every bay with
  // every street segment in an entire airport-sized map request.
  const clearanceCells=new Map();let clearanceEntries=0,clearanceOverflow=false;
  function indexClearance(a,b,radius) {
    const x0=Math.floor((Math.min(a.x,b.x)-radius)/CELL),x1=Math.floor((Math.max(a.x,b.x)+radius)/CELL);
    const z0=Math.floor((Math.min(a.z,b.z)-radius)/CELL),z1=Math.floor((Math.max(a.z,b.z)+radius)/CELL);
    if ((x1-x0+1)*(z1-z0+1)+clearanceEntries>100000) {clearanceOverflow=true;return;}
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++) {
      const key=`${x}:${z}`;if(!clearanceCells.has(key))clearanceCells.set(key,[]);
      clearanceCells.get(key).push({a,b,radius});clearanceEntries++;
    }
  }
  for(const gate of gates)for(const p of gate.geometry.points)indexClearance(p,p,Math.max(1.5,(gate.attributes?.width||4)/2)+1);
  for(const corridor of corridors)for(let i=1;i<corridor.geometry.points.length;i++)
    indexClearance(corridor.geometry.points[i-1],corridor.geometry.points[i],Math.max(1.5,Math.min(200,corridor.width/2))+1.5);
  const cells=new Map(), bays=[];
  let clearances=0, outside=0, attempted=0, truncated=clearanceOverflow || membershipBudget.overflow;
  outer: for (const fence of fences) {
    if (truncated) break;
    const points=fence.geometry.points;
    for (let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i], length=Math.hypot(b.x-a.x,b.z-a.z);
      if (length<.2) continue;
      // A pathological source cannot allocate millions of bays before the cap.
      const count=Math.ceil(length/2);
      if (count>MAX_BAYS) {truncated=true;continue;}
      for (let j=0;j<count;j++) {
        if (++attempted>MAX_BAYS*2) {truncated=true;break outer;}
        const at=t=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
        const start=at(j/count),end=at((j+1)/count),mid=at((j+.5)/count);
        const site=sites.find(s=>s.contains(start)&&s.contains(mid)&&s.contains(end));
        if (membershipBudget.overflow) {truncated=true;break outer;}
        if (!site) {outside++;continue;}
        const nearby=new Set();
        for(const p of [start,mid,end])for(const c of clearanceCells.get(`${Math.floor(p.x/CELL)}:${Math.floor(p.z/CELL)}`)||[])nearby.add(c);
        const blocked=[...nearby].some(c=>segmentsDistance(start,end,c.a,c.b)<c.radius);
        if (blocked) {clearances++;continue;}
        const bay=Object.freeze({id:`${fence.id}:${i}:${j}`,sourceId:fence.id,siteId:site.id,start,end,mid,
          height:Math.max(1,Math.min(4,Number(fence.attributes?.height)||2.5))});
        const key=`${Math.floor(mid.x/CELL)}:${Math.floor(mid.z/CELL)}`;
        if (!cells.has(key)) cells.set(key,[]);
        cells.get(key).push(bay);bays.push(bay);
        if (bays.length>=MAX_BAYS) {truncated=true;break outer;}
      }
    }
  }
  return Object.freeze({
    count:bays.length, diagnostics:Object.freeze({siteCount:sites.length,fenceCount:fences.length,clearances,outside,truncated,membershipChecks:membershipBudget.checks}),
    near(point,radius=160,limit=256) {
      if (!point || !Number.isFinite(point.x)||!Number.isFinite(point.z)) return [];
      radius=Math.max(1,Math.min(256,radius));limit=Math.max(0,Math.min(512,limit));
      const candidates=[];
      for (let x=Math.floor((point.x-radius)/CELL);x<=Math.floor((point.x+radius)/CELL);x++)
        for (let z=Math.floor((point.z-radius)/CELL);z<=Math.floor((point.z+radius)/CELL);z++)
          for (const bay of cells.get(`${x}:${z}`)||[]) {
            const distance=Math.hypot(bay.mid.x-point.x,bay.mid.z-point.z);
            if (distance<=radius) candidates.push({bay,distance});
          }
      return candidates.sort((a,b)=>a.distance-b.distance||a.bay.id.localeCompare(b.bay.id)).slice(0,limit).map(({bay})=>bay);
    }
  });
}

function groundPerimeterBay(bay,sampleGround) {
  const y0=sampleGround?.(bay.start.x,bay.start.z),y1=sampleGround?.(bay.end.x,bay.end.z);
  const ym=sampleGround?.(bay.mid.x,bay.mid.z),length=Math.hypot(bay.end.x-bay.start.x,bay.end.z-bay.start.z);
  // Unknown or discontinuous ground is not an excuse to span a ravine or to
  // place a hidden collision wall through a tunnel portal.
  if (![y0,y1,ym].every(v=>typeof v==='number'&&Number.isFinite(v)) || Math.abs(y1-y0)>length*.45 || Math.abs(ym-(y0+y1)/2)>.2) return null;
  return {...bay,y0,y1};
}

export {compileFacilityPerimeterPlan,groundPerimeterBay,pointSegmentDistance};
