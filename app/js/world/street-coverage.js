import { resolveStreetSection } from './compiler/street-section.js';

// Measures source coverage, not visible pavement. A compiled window cannot
// certify its polygons, heights or pixels merely by containing a road.
export function segmentCoverageFraction(a, b, bounds) {
  if (!bounds) return 0;
  let start = 0, end = 1;
  for (const [axis, min, max] of [['x', bounds.minX, bounds.maxX], ['z', bounds.minZ, bounds.maxZ]]) {
    if (![min, max, a[axis], b[axis]].every(Number.isFinite) || min > max) return 0;
    const delta = b[axis] - a[axis];
    if (!delta) { if (a[axis] < min || a[axis] > max) return 0; continue; }
    const t0 = (min - a[axis]) / delta, t1 = (max - a[axis]) / delta;
    start = Math.max(start, Math.min(t0, t1)); end = Math.min(end, Math.max(t0, t1));
  }
  return Math.max(0, end - start);
}

const groundFeature = f => !f.isStructureConnector && !f.structureSemantics?.gradeSeparated &&
  !f.structureSemantics?.rampCandidate && ['at_grade', undefined].includes(f.structureSemantics?.terrainMode);
const intersects = (a, b, pad = 0) => a.minX <= b.maxX + pad && a.maxX >= b.minX - pad && a.minZ <= b.maxZ + pad && a.maxZ >= b.minZ - pad;
const box = (a, b) => ({minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minZ:Math.min(a.z,b.z),maxZ:Math.max(a.z,b.z)});

export function auditStreetCoverage({roads = [], buildings = [], linearFeatures = [], coverageBounds, metersPerWorldUnit = 1.11}) {
  const cells = new Map(), wide = [], size = 64;
  for (const building of buildings) {
    if (building.allowsPassageBelow) continue;
    const pts = building.surfaceFootprint || building.pts || building.footprint || [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (Math.hypot(b.x-a.x,b.z-a.z) < 3) continue;
      const edge = box(a,b), x0=Math.floor((edge.minX-20)/size),x1=Math.floor((edge.maxX+20)/size),z0=Math.floor((edge.minZ-20)/size),z1=Math.floor((edge.maxZ+20)/size);
      if ((x1-x0+1)*(z1-z0+1)>256) { wide.push(edge); continue; }
      for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++) {const key=`${x}:${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(edge);}
    }
  }
  const urban = bounds => {
    if(wide.some(edge=>intersects(edge,bounds,20)))return true;
    const x0=Math.floor(bounds.minX/size),x1=Math.floor(bounds.maxX/size),z0=Math.floor(bounds.minZ/size),z1=Math.floor(bounds.maxZ/size);
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)if(cells.get(`${x}:${z}`)?.some(edge=>intersects(edge,bounds,20)))return true;
    return false;
  };
  let required=0, covered=0, requiredSegments=0, uncoveredSegments=0;
  const examples=[];
  const add = (a,b,sides,kind,name) => {
    const length=Math.hypot(b.x-a.x,b.z-a.z)*metersPerWorldUnit*sides;
    if(!Number.isFinite(length)||length<=0)return;
    const fraction=segmentCoverageFraction(a,b,coverageBounds);
    required+=length;covered+=length*fraction;requiredSegments++;
    if(fraction<1-1e-8){uncoveredSegments++;if(examples.length<8)examples.push({kind,name:name||null,a,b,uncoveredMeters:length*(1-fraction)});}
  };
  for(const road of roads) {
    if(!groundFeature(road))continue;
    const pts=road.pts||[],tags=road.transportRecord?.sourceTags||road.tags||{};
    for(let i=1;i<pts.length;i++) {
      const a=pts[i-1],b=pts[i],section=resolveStreetSection({...tags,highway:tags.highway||road.type},{urban:urban(box(a,b))});
      const sides=Number(section.left.presence==='present')+Number(section.right.presence==='present');
      if(sides)add(a,b,sides,'road-side',road.name);
    }
  }
  for(const path of linearFeatures) {
    if(!groundFeature(path)||path.kind!=='footway'||path.subtype!=='sidewalk')continue;
    for(let i=1;i<(path.pts?.length||0);i++)add(path.pts[i-1],path.pts[i],1,'mapped-sidewalk',path.name);
  }
  return {scope:'Loaded source network requiring inferred or mapped sidewalks; length within the compilation window, not proof of rendered pavement. Separately tagged sidewalks need mapped path data.',
    requiredSidewalkMeters:required,withinCompilationWindowMeters:covered,outsideCompilationWindowMeters:Math.max(0,required-covered),
    compilationCoveragePercent:required>0?100*covered/required:null,requiredSegments,uncoveredSegments,examples,
    status:required===0?'unknown':uncoveredSegments?'incomplete':'source window covers required network'};
}
