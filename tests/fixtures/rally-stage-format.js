// Controlled source/physics fixture. It is not a geographic rally pack.
import {stagePathFixture} from './racing-stage-source.mjs';
import {normalizeRaceVenueSource} from '../../app/js/racing/venue-course-policy.js';
import {prepareVenueRacePath} from '../../app/js/racing/venue-courses.js';
import {createRaceCourse} from '../../app/js/racing/course-rules.js';
export function createRallyStageFixture({hill=true,surfaces=['asphalt-dry','gravel-dry','snow-ice'],participants=2}={}){
 const {district,venue}=stagePathFixture(),header=structuredClone(district.venueSource);
 header.stage.rally={version:1,legSurfaces:surfaces,
  splits:[{legIndex:0,segment:2,fraction:.5,label:'Split 1'},{legIndex:1,segment:0,fraction:.5,label:'Split 2'}],
  paceNotes:[{legIndex:0,segment:1,fraction:.65,call:'crest'},{legIndex:1,segment:1,fraction:.5,call:'caution'}]};
 district.venueSource=normalizeRaceVenueSource(header);venue.venueSource=district.venueSource;
 const start=district.roads[0].a,unit=district.metersPerUnit,height=d=>!hill?0:d<60?0:d<125?(d-60)*.2:d<190?(190-d)*.2:0;
 for(const road of district.roads){
  const a=(road.a.x-start.x)*unit,b=(road.b.x-start.x)*unit;
  const stations=[0,1,...[60,125,190].map(d=>(d-a)/(b-a)).filter(t=>t>0&&t<1)].sort((a,b)=>a-b);
  road.a.y=height(a)/unit;road.b.y=height(b)/unit;
  road.heightSamples=stations.map(t=>{const y=height(a+(b-a)*t)/unit;return {t,y,leftY:y,rightY:y};});
 }
 const prepared=prepareVenueRacePath(district,venue),course=createRaceCourse(prepared.graph,prepared.path,{discipline:'rally',laps:1,participants,
  name:'Controlled mixed-surface stage',locationId:district.locationId,locationLabel:district.locationLabel,anchor:district.anchor});
 return {district,venue,...prepared,course};
}
