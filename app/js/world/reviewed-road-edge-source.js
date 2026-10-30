import {validateStreetEdgeRecipe} from './compiler/street-edge-recipe.js';
import {BANKED_ROAD_MODEL} from '../physics/road-plane-dynamics.js';

// Read the existing private source annotation and its matching compiled model.
// Tags and serialized provider data never opt a live street into raised edges.
export function reviewedRoadEdgeRecipe(road){
 const evidence=road.surfaceSurveyEvidence,recipe=evidence?.edgeBandRecipe;
 if(!recipe)return undefined;
 const survey=road.transportSurfaceModel?.surveyedSurface;
 if(!survey||survey.edgeBandRecipe!==recipe||survey.venueId!==evidence.venueId||survey.sourceFeatureId!==String(road.sourceFeatureId)||
  survey.surfaceModel!==BANKED_ROAD_MODEL||recipe.venueId!==survey.venueId||recipe.sourceFeatureId!==survey.sourceFeatureId||
  recipe.sourceSha256!==survey.venueSource?.sourceSha256||!['accepted','preparation'].includes(road.transportSurfaceModel.reviewedSurfacePhase))throw Error('unreviewed_street_edge_recipe');
 return validateStreetEdgeRecipe(recipe);
}
