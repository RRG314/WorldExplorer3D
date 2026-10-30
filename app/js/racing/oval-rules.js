// Original game format constants. The existing session owns the clock and
// actors; these values confer no venue, road or result authority.
export const OVAL_FORMATION_DURATION_MS=4000;
export const OVAL_PACE_METERS_PER_SECOND=10;
export const OVAL_FORMATION_DISTANCE_METERS=OVAL_PACE_METERS_PER_SECOND*OVAL_FORMATION_DURATION_MS/1000;
export const OVAL_CAUTION_DURATION_MS=5000;
export const OVAL_ORDER_PENALTY_MS=5000;
export const OVAL_MERGE_CLEARANCE_METERS=10;
// Original game aerodynamic coefficient, not a measured vehicle specification.
export const OVAL_AERODYNAMIC_DRAG_PER_METER=.0004;

// These are original game rules, not a sanctioning body's regulations. Read
// only the course's qualified cross section; the apron remains physical road.
export function ovalTrackZone(projection){
 const p=projection?.pavement,l=projection?.lateralMeters;
 if(!p||!Number.isFinite(l))return 'outside';
 const low=p.racingOffsetMeters-p.racingWidthMeters/2,high=p.racingOffsetMeters+p.racingWidthMeters/2;
 if(l>=low&&l<=high)return 'bank';
 if(l<p.minimumMeters||l>p.maximumMeters)return 'outside';
 const innerPositive=p.maximumMeters-high>low-p.minimumMeters;
 return (innerPositive?l>high:l<low)?'apron':'outside';
}
export function ovalPaceActions(actions,speedMetersPerSecond,restricted){
 if(!restricted||Math.abs(speedMetersPerSecond)<=OVAL_PACE_METERS_PER_SECOND)return actions;
 return {...actions,throttle:0,reverse:0,serviceBrake:Math.max(actions.serviceBrake||0,Math.min(1,(Math.abs(speedMetersPerSecond)-OVAL_PACE_METERS_PER_SECOND)*.35))};
}
export function ovalDistanceGap(from,to,length){return ((to-from+length*1.5)%length)-length/2;}
export function ovalDraftActor(uid,car,handling,zone,speedMetersPerSecond,active=true){
 return {uid,x:car.x,y:car.y,z:car.z,angle:car.angle,speedMetersPerSecond,lengthMeters:handling.length,widthMeters:handling.width,zone,active};
}
export function ovalDraftReduction(subject,actors,metersPerUnit,{enabled=true}={}){
 const usable=a=>a?.active&&a.zone==='bank'&&a.speedMetersPerSecond>=12&&[a.x,a.y,a.z,a.angle,a.lengthMeters,a.widthMeters].every(Number.isFinite);
 if(!enabled||!(metersPerUnit>0)||!usable(subject))return 0;
 const fx=Math.sin(subject.angle),fz=Math.cos(subject.angle);let reduction=0;
 for(const other of actors){
  if(other.uid===subject.uid||!usable(other)||Math.cos(other.angle-subject.angle)<.985||Math.abs(other.y-subject.y)*metersPerUnit>1.5)continue;
  const dx=(other.x-subject.x)*metersPerUnit,dz=(other.z-subject.z)*metersPerUnit,
   gap=dx*fx+dz*fz-(subject.lengthMeters+other.lengthMeters)*.5,lateral=Math.abs(dx*fz-dz*fx),width=Math.min(subject.widthMeters,other.widthMeters)*.75;
  if(gap<=0||gap>=35||lateral>=width)continue;
  // One wake at most. Overlap, side-by-side cars and a train of competitors
  // cannot compound a speed bonus; this only reduces the existing drag force.
  reduction=Math.max(reduction,.3*(1-gap/35)*Math.min(1,gap/3)*(1-lateral/width));
 }return reduction;
}
