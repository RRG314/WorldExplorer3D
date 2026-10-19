import {AQUARIUM_GEOGRAPHY as geography} from './aquarium-geography.js';
import {matchMappedInteriorFootprint} from './content-contract.js';
import {createAquariumLayout} from './aquarium-layout.js';

export const AQUARIUM_CONTENT=Object.freeze({
 schemaVersion:1,id:'national-aquarium-reef-visit',version:'2026-10-13',venueType:'aquarium',kind:'interpretive',title:'National Aquarium · Blacktip Reef',
 accuracyLabel:'A reconstructed visit to the Glass Pavilion and Blacktip Reef, based on the National Aquarium’s public visitor maps. Room dimensions and finishes are estimated. The animals illustrate species; they are not a live census or replicas of named residents. Other exhibits are outside this visit. Independent World Explorer interpretation.',
 sources:[{id:'visitor-route',url:'https://aqua.org/assets/documents/National-Aquarium-Accessibility-Guide.pdf',title:'National Aquarium accessibility guide'},{id:'reef',url:'https://aqua.org/explore/exhibits/blacktip-reef',title:'Blacktip Reef'},{id:'turtle',url:'https://aqua.org/explore/animals/green-sea-turtle',title:'Green sea turtle'}],
 habitat:{id:'blacktip-reef',title:'Blacktip Reef',buildingSourceId:geography.sourceId,
  building:'Blue Wonders',gallery:'Blacktip Reef',type:'indo-pacific-reef',reviewedAt:'2026-10-13',
  viewingFloorIds:['pavilion-1','reef-m'],sourceIds:['visitor-route','reef'],
  confidence:{placement:'MAPPED',geometry:'INFERRED',animals:'REPRESENTATIVE'},
  populationMeaning:'Bounded game population; no claim about real animal counts or individual residents.',
  species:[
   {id:'blacktip-reef-shark',scientificName:'Carcharhinus melanopterus',modelId:'aquarium-blacktip-reef-shark',sourceId:'reef',population:3,
    route:{u:-39,v:64,radiusU:6,radiusV:5,radiusStep:.3,radiusVStep:.22,speed:.12,speedStep:.011,depth:1.2,depthStep:.65,phase:0}},
   {id:'green-sea-turtle',scientificName:'Chelonia mydas',modelId:'aquarium-green-sea-turtle',sourceId:'reef',population:1,
    route:{u:-39,v:64,radiusU:5,radiusV:4,speed:.055,depth:2.9,phase:3*1.73}}
  ],
  decoration:{models:['marine-branch-coral','marine-massive-coral','marine-table-coral'],u:-39,v:54,offset:9,spacing:2.15,
   confidence:'REPRESENTATIVE',provenance:'Smithsonian CC0 scans illustrate fabricated reef structure; not scans of Baltimore coral.'},
  lighting:{profile:'authored-reef',confidence:'INFERRED'},water:{profile:'contained-water-optics',confidence:'REPRESENTATIVE'},
  journalObservationIds:['reef-community','blacktip-motion','turtle-observation'],fieldGuidePolicy:'No wild-sighting credit'
 },
 observations:[
  {id:'reef-community',title:'A reef is a community',floorId:'pavilion-1',u:-18,v:55,description:'Watch the reef from above, then compare it with the underwater window. Open water gives swimming animals room to move; branches and crevices give smaller animals shelter. The real Blacktip Reef uses fabricated coral to recreate this structure.',prompt:'Find the open swimming lane and the sheltered coral edges.',sourceId:'reef'},
  {id:'blacktip-motion',title:'Follow a blacktip reef shark',floorId:'reef-m',u:-18.5,v:57.4,description:'Blacktip reef sharks are grey with dark fin tips. The National Aquarium describes them swimming together through Blacktip Reef. Follow one complete circuit and look at how its tail and pectoral fins contribute to steady movement.',prompt:'Watch one shark make a circuit without losing sight of it.',sourceId:'reef'},
  {id:'turtle-observation',title:'A reptile in the reef',floorId:'reef-m',u:-18.5,v:69.3,description:'A green sea turtle is a reptile, not a fish. Look for its shell and broad front flippers, then compare its slower strokes with a shark’s tail movement. This swimming model represents the species; it does not portray an individual animal at the Aquarium.',prompt:'Compare a flipper stroke with a shark’s tail beat.',sourceId:'turtle'}
 ]
});
export function resolveAquariumInterior(ctx,support,definition){
 if(!definition||definition.accessDenied||definition.communityRealityCapture||definition.mode==='mapped'||definition.curatedContent)return definition;
 const content=AQUARIUM_CONTENT,association=matchMappedInteriorFootprint({...content,association:{sourceIds:[geography.sourceId],footprint:geography.component}},support,(lat,lon)=>ctx.geoToWorld(lat,lon),ctx.METERS_PER_WORLD_UNIT||1);
 if(!association)return definition;
 const entrance=ctx.geoToWorld(geography.entrance.lat,geography.entrance.lon),actual=support.exteriorEntrance;
 if(!actual||Math.hypot(actual.x-entrance.x,actual.z-entrance.z)*(ctx.METERS_PER_WORLD_UNIT||1)>8)return definition;
 const plan=createAquariumLayout((lat,lon)=>ctx.geoToWorld(lat,lon),ctx.METERS_PER_WORLD_UNIT||1);
 return {...definition,label:content.title,aquariumContent:content,aquariumPlan:plan,contentAssociation:association,authoredLayout:plan.layout};
}
