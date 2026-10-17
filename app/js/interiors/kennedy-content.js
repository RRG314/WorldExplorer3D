import {isVehicleAssemblyBuilding} from '../world/kennedy-facility.js';

export const KENNEDY_CONTENT=Object.freeze({
 id:'kennedy-vab',title:'Vehicle Assembly Building',
 description:'Explore the transfer aisle, high bays and low bay. This independent reconstruction follows NASA’s published dimensions and photographs. Equipment positions and the ground-floor visitor route are interpretive; this is not a live view of operations.',
 source:'https://www.nasa.gov/kennedy/partnerships/vehicleassemblybuilding/',
 stations:[
  {id:'orientation',title:'Inside the VAB',x:5,z:-59,text:'The high bay rises 160 metres. The 28-metre transfer aisle runs through the building, between four high bays. Walk south to the low bay, or step into the western bay to see the crawler.',task:'Follow the yellow transfer-aisle markings. The street exit is behind you.'},
  {id:'crawler',title:'Crawler transporter',x:-22,z:-25,text:'Crawler transporters carry a launch platform and rocket from the assembly building to the launch pad. Their wide tracks spread the enormous load. This NASA model shows the transporter’s machinery and tread assemblies.',task:'Walk around the transporter and find its four pairs of tracks.'},
  {id:'assembly',title:'High-bay assembly',x:17,z:25,text:'Rocket components are lifted vertically and assembled in high bays. Overhead bridge cranes move along rails near the roof. Work platforms surround the vehicle at the heights needed for assembly and inspection.',task:'Look up at the crane rails and bridge, then compare their height with the marked transfer aisle.'},
  {id:'low-bay',title:'From preparation to rollout',x:5,z:94,text:'The low bay provides a lower-height preparation area at the south end. The route from assembly to the pad continues outside along the crawlerway to Launch Complex 39.',task:'Complete the ground-system sequence: prepare components, assemble in the high bay, then roll out to the pad.'}
 ]
});
export function resolveKennedyInterior(support,definition){
 if(!definition||definition.accessDenied||definition.communityRealityCapture||definition.mode==='mapped'||!isVehicleAssemblyBuilding(support?.building))return definition;
 return {...definition,label:KENNEDY_CONTENT.title,facilityContent:KENNEDY_CONTENT};
}
