import {sampleRaceSegmentY} from './course-rules.js';
// Published road geometry remains unchanged. Closed-course participants use a
// scoped presentation exclusion for civilians, retired by the same world scope.
export function raceClosureContains(course,pose,extra=4) {
 if(!course||!pose)return false;
 for(const s of course.segments) {
  const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,l=dx*dx+dz*dz;
  const t=Math.max(0,Math.min(1,((pose.x-s.a.x)*dx+(pose.z-s.a.z)*dz)/l));
  if(Math.hypot(pose.x-s.a.x-dx*t,pose.z-s.a.z-dz*t)*course.metersPerUnit<=s.widthMeters*.5+extra &&
   Math.abs(Number(pose.y||0)-sampleRaceSegmentY(s,t))*course.metersPerUnit<4)return true;
 }
 return false;
}
