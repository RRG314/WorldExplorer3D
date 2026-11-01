import {roadMetersPerWorldUnit} from '../road-units.js';

export function validateStreetEdgeRecipe(recipe){
 if(recipe?.sourceLengthMeters!==undefined&&(!Number.isFinite(recipe.sourceLengthMeters)||recipe.sourceLengthMeters<=0||recipe.sourceLengthMeters>30000))throw Error('invalid_street_edge_recipe');
 if(!recipe||recipe.version!==1||!Array.isArray(recipe.bands)||recipe.bands.length>128)throw Error('invalid_street_edge_recipe');
 for(const b of recipe.bands){
  if(!b||![b.startMeters,b.endMeters,b.widthMeters,b.heightMeters,b.rampMeters,b.taperMeters,b.stripeMeters,b.phaseMeters].every(Number.isFinite)||
   ![-1,1].includes(b.side)||b.startMeters< -30000||b.endMeters>30000||b.endMeters<=b.startMeters||
   b.widthMeters<.3||b.widthMeters>1.2||b.heightMeters<=0||b.heightMeters>.1||b.rampMeters<.2||b.rampMeters>=b.widthMeters||
   b.heightMeters/b.rampMeters>.3||b.taperMeters<2||b.taperMeters>20||b.stripeMeters<.5||b.stripeMeters>3||Math.abs(b.phaseMeters)>30000)throw Error('invalid_street_edge_recipe');
 }
 for(let i=0;i<recipe.bands.length;i++)for(let j=0;j<i;j++)if(recipe.bands[i].side===recipe.bands[j].side&&Math.max(recipe.bands[i].startMeters,recipe.bands[j].startMeters)<Math.min(recipe.bands[i].endMeters,recipe.bands[j].endMeters)-1e-6)throw Error('overlapping_street_edge_recipe');
 return recipe;
}
export function streetEdgeRecipeState(road){
 const recipe=road.edgeBandRecipe;if(!recipe)return null;validateStreetEdgeRecipe(recipe);
 const unit=roadMetersPerWorldUnit(road),distances=[0];
 for(let i=1;i<road.pts.length;i++)distances.push(distances[i-1]+Math.hypot(road.pts[i].x-road.pts[i-1].x,road.pts[i].z-road.pts[i-1].z)*unit);
 const scale=recipe.sourceLengthMeters?distances.at(-1)/recipe.sourceLengthMeters:1;
 return {recipe:scale===1?recipe:{...recipe,bands:recipe.bands.map(b=>({...b,startMeters:b.startMeters*scale,endMeters:b.endMeters*scale}))},unit,distances};
}
