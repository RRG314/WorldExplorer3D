import {AQUARIUM_GEOGRAPHY as geography} from './aquarium-geography.js';
import {matchMappedInteriorFootprint} from './content-contract.js';
import {createAquariumLayout} from './aquarium-layout.js';

export const AQUARIUM_CONTENT=Object.freeze({
 schemaVersion:1,id:'national-aquarium-reef-visit',version:'2026-10-12',venueType:'aquarium',kind:'interpretive',title:'National Aquarium · Blacktip Reef',
 accuracyLabel:'A reconstructed visit to the Glass Pavilion and Blacktip Reef, based on the National Aquarium’s public visitor maps. Room dimensions and finishes are estimated. The animals illustrate species; they are not a live census or replicas of named residents. Other exhibits are outside this visit. Independent World Explorer interpretation.',
 sources:[{id:'visitor-route',url:'https://aqua.org/assets/documents/National-Aquarium-Accessibility-Guide.pdf',title:'National Aquarium accessibility guide'},{id:'reef',url:'https://aqua.org/explore/exhibits/blacktip-reef',title:'Blacktip Reef'},{id:'turtle',url:'https://aqua.org/explore/animals/green-sea-turtle',title:'Green sea turtle'}],
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
