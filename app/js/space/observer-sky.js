// Positions are heliocentric equatorial light years: +X RA 0, +Y north,
// +Z RA 6h. Rendering scale never changes this catalog frame.
export function catalogStarPosition(star) {
  const ra = star.ra * Math.PI / 12, dec = star.dec * Math.PI / 180;
  const distance = Number(star.dist);
  if (!(distance > 0)) return null;
  return { x: distance * Math.cos(dec) * Math.cos(ra), y: distance * Math.sin(dec), z: distance * Math.cos(dec) * Math.sin(ra) };
}
export function projectCatalogStar(star, observer = { x: 0, y: 0, z: 0 }, radius = 300000) {
  const physical = catalogStarPosition(star);
  if (!physical && Math.hypot(observer.x, observer.y, observer.z) > 0.001) return null;
  const p = physical || catalogStarPosition({ ...star, dist: 1 });
  const x = p.x - observer.x, y = p.y - observer.y, z = p.z - observer.z;
  const distance = Math.hypot(x, y, z);
  if (distance < 1e-9) return null;
  return { x: x / distance * radius, y: y / distance * radius, z: z / distance * radius,
    distanceLy: physical ? distance : null,
    magnitude: physical ? star.mag + 5 * Math.log10(distance / star.dist) : star.mag };
}

// Line figures are annotations on the observer's sky sphere, never chords
// through navigable space. Undefined/antipodal projections have no unique arc.
export function skyArcPoints(a,b,radius,steps=12){
 if(!a||!b)return Array.from({length:steps+1},()=>({x:0,y:0,z:0}));
 const al=Math.hypot(a.x,a.y,a.z),bl=Math.hypot(b.x,b.y,b.z);
 const dot=(a.x*b.x+a.y*b.y+a.z*b.z)/(al*bl);
 if(!(al>0&&bl>0)||dot<-.999)return Array.from({length:steps+1},()=>({x:0,y:0,z:0}));
 const theta=Math.acos(Math.max(-1,Math.min(1,dot))),sin=Math.sin(theta);
 return Array.from({length:steps+1},(_,i)=>{
  const t=i/steps,wa=theta<1e-6?1-t:Math.sin((1-t)*theta)/sin,wb=theta<1e-6?t:Math.sin(t*theta)/sin;
  const x=wa*a.x/al+wb*b.x/bl,y=wa*a.y/al+wb*b.y/bl,z=wa*a.z/al+wb*b.z/bl,length=Math.hypot(x,y,z);
  return {x:x/length*radius,y:y/length*radius,z:z/length*radius};
 });
}
