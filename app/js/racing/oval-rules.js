// Original game format constants. The existing session owns the clock and
// actors; these values confer no venue, road or result authority.
export const OVAL_FORMATION_DURATION_MS=4000;
export const OVAL_PACE_METERS_PER_SECOND=10;
export const OVAL_FORMATION_DISTANCE_METERS=OVAL_PACE_METERS_PER_SECOND*OVAL_FORMATION_DURATION_MS/1000;
export const OVAL_CAUTION_DURATION_MS=5000;
export const OVAL_ORDER_PENALTY_MS=5000;
export const OVAL_MERGE_CLEARANCE_METERS=10;

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
