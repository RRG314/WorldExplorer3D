import {wallDirections} from './orientation.js';
const DEG=Math.PI/180;
export function rankSurveyBuildings(metadata,buildings){
  const location=metadata?.location;if(!location)return [];
  const lat=location.latitude,lon=location.longitude;
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return [];
  const heading=metadata.heading?.reference==='true'?metadata.heading.degrees:null;
  const ranked=[];
  for(const building of buildings){
    if(!Number.isFinite(building.lat)||!Number.isFinite(building.lon)||!building.sourceBuildingId)continue;
    const x=(building.lon-lon)*111320*Math.cos(lat*DEG),z=(lat-building.lat)*111320;
    const distance=Math.hypot(x,z);if(distance>180)continue;
    const bearing=(Math.atan2(x,-z)/DEG+360)%360;
    const delta=heading===null?null:Math.abs(((bearing-heading+540)%360)-180);
    const walls=wallDirections(building.spatialContext.footprint).map(w=>{
      const dx=-x-w.midpoint.x,dz=-z-w.midpoint.z,d=Math.hypot(dx,dz);
      const facing=d>0?(dx*w.normal.x+dz*w.normal.z)/d:-1;
      return {...w,distance:d,facing};
    }).filter(w=>w.facing>.15).sort((a,b)=>b.facing-a.facing||a.distance-b.distance);
    const inView=delta!==null&&delta<=40;
    ranked.push({building,distance,wall:walls[0]?.wall??null,confidence:inView?'MEDIUM':'LOW',score:distance+(delta??90)*2,
      reason:heading===null?'Nearby camera position only; subject and side need confirmation.':inView?'Camera points toward this building; confirm the building and side.':'Outside the central camera direction; possible alternative.'});
  }
  // These are heuristic suggestions, never probabilities or confirmed assignments.
  return ranked.sort((a,b)=>a.score-b.score).slice(0,3);
}
