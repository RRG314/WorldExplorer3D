import {racePavementCrossSection} from './pavement-cross-section.js';
import {sampleRaceSegmentY} from './course-rules.js';
// Published road geometry remains unchanged. Closed-course participants use a
// scoped presentation exclusion for civilians, retired by the same world scope.
export function raceClosureContains(course,pose,extra=4) {
 if(!course||!pose)return false;
 for(const s of course.segments) {
  const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,l=dx*dx+dz*dz;
  const t=Math.max(0,Math.min(1,((pose.x-s.a.x)*dx+(pose.z-s.a.z)*dz)/l));
  const section=racePavementCrossSection(s,t),lateral=((pose.x-s.a.x-dx*t)*s.forward.z-(pose.z-s.a.z-dz*t)*s.forward.x)*course.metersPerUnit;
  if(section){const along=Math.abs((pose.x-s.a.x-dx*t)*s.forward.x+(pose.z-s.a.z-dz*t)*s.forward.z)*course.metersPerUnit;if(along<=extra&&lateral>=section.minimumMeters-extra&&lateral<=section.maximumMeters+extra&&Math.abs(Number(pose.y||0)-sampleRaceSegmentY(s,t,lateral))*course.metersPerUnit<4)return true;continue;}
  if(Math.hypot(pose.x-s.a.x-dx*t,pose.z-s.a.z-dz*t)*course.metersPerUnit<=s.widthMeters*.5+extra &&
   Math.abs(Number(pose.y||0)-sampleRaceSegmentY(s,t))*course.metersPerUnit<4)return true;
 }
 return false;
}
