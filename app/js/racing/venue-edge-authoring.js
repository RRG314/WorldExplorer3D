import {geographicVenueDistance} from './venue-layout.js';
import {validateStreetEdgeRecipe} from '../world/compiler/street-edge-recipe.js';

// Original game dressing anchored to the pinned mapped bends. These are not
// surveyed official kerb positions or an assertion of finished venue artwork.
export function authorVenueEdgeRecipes(layout,descriptor){
 if(descriptor.edgeBandAuthoring===undefined)return new Map();
 if(descriptor.edgeBandAuthoring!=='mapped-bend-game-dressing-v1'||descriptor.surfaceModel!=='banked-road-v1'||descriptor.routeExtent!=='mapped-venue-v1')throw Error('venue_edge_authoring_invalid');
 const recipes=new Map();
 for(const id of layout.wayIds){
  const way=layout.ways.get(id);if(way.tags.bridge&&!['no','false','0'].includes(way.tags.bridge))continue;
  const distances=[0],runs=[];
  for(let i=1;i<way.geometry.length;i++)distances.push(distances.at(-1)+geographicVenueDistance(way.geometry[i-1],way.geometry[i]));
  for(let i=1;i<way.geometry.length-1;i++){
   const a=way.geometry[i-1],b=way.geometry[i],c=way.geometry[i+1],cos=Math.cos(b.lat*Math.PI/180),ax=(b.lon-a.lon)*cos,az=b.lat-a.lat,bx=(c.lon-b.lon)*cos,bz=c.lat-b.lat,
    turn=Math.atan2(ax*bz-az*bx,ax*bx+az*bz);
   if(Math.abs(turn)<4*Math.PI/180||Math.abs(turn)>Math.PI*.8)continue;
   runs.push({side:Math.sign(turn),startMeters:Math.max(0,distances[i]-14),endMeters:Math.min(distances.at(-1),distances[i]+24)});
  }
  const merged=[];
  for(const side of [-1,1])for(const run of runs.filter(r=>r.side===side).sort((a,b)=>a.startMeters-b.startMeters)){
   const prior=merged.at(-1);if(prior?.side===side&&run.startMeters<=prior.endMeters+4)prior.endMeters=Math.max(prior.endMeters,run.endMeters);else merged.push({...run});
  }
  const bands=merged.filter(b=>b.endMeters-b.startMeters>=6).map(b=>Object.freeze({...b,widthMeters:.7,heightMeters:.045,rampMeters:.35,taperMeters:5,stripeMeters:1,phaseMeters:0}));
  if(!bands.length)continue;
  const recipe={version:1,sourceLengthMeters:distances.at(-1),venueId:descriptor.id,sourceFeatureId:`osm:way:${id}`,sourceSha256:descriptor.sourceSha256,bands:Object.freeze(bands)};
  validateStreetEdgeRecipe(recipe);recipes.set(id,Object.freeze(recipe));
 }
 return recipes;
}
