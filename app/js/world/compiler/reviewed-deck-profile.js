// A reviewed source annotation becomes an input to the existing transport
// compilation. It is never a live sampler or a post-publication Y override.
export function validateReviewedDeckProfile(survey,mode,total,maximumGrade){
 return validateProfile(survey?.deckProfile,survey,mode,'elevated',total,maximumGrade,'invalid_reviewed_deck_profile');
}
export function validateReviewedPavementProfile(survey,mode,total,maximumGrade){
 const profile=survey?.pavementProfile;
 if(profile&&!(profile.maximumAdjustmentMeters>0&&profile.maximumAdjustmentMeters<=.05))throw Error('invalid_reviewed_pavement_profile');
 return validateProfile(profile,survey,mode,'at_grade',total,maximumGrade,'invalid_reviewed_pavement_profile');
}
function validateProfile(deck,survey,mode,expectedMode,total,maximumGrade,error){
 if(!deck)return null;
 if(mode!==expectedMode||deck.version!==1||deck.coordinateFrame!=='world'||
  !/^[a-f0-9]{64}$/.test(deck.contentSha256)||!Array.isArray(deck.samples)||deck.samples.length<2||deck.samples.length>1000||
  deck.samples[0].t!==0||deck.samples.at(-1).t!==1||!(deck.observedCoreWidthMeters>0)||
  !(deck.reconstructedWidthMeters>=deck.observedCoreWidthMeters)||
  ![deck.observedCoreWidthMeters,deck.reconstructedWidthMeters,total,maximumGrade,survey.maximumCrossfall].every(Number.isFinite)||
  deck.reconstructedWidthMeters>30||!(maximumGrade>0)||!(survey.maximumCrossfall>=0)||!(total>0))throw Error(error);
 for(let i=0;i<deck.samples.length;i++){
  const p=deck.samples[i],previous=deck.samples[i-1];
  if(!['t','centerY','crossfall'].every(k=>Number.isFinite(p[k]))||p.t<0||p.t>1||
   Math.abs(p.crossfall)>survey.maximumCrossfall||previous&&(p.t<=previous.t||Math.abs(p.centerY-previous.centerY)/((p.t-previous.t)*total)>maximumGrade+1e-6))throw Error(error);
 }
 return Object.freeze({...deck,samples:Object.freeze(deck.samples.map(p=>Object.freeze({...p})))});
}
export function sampleReviewedDeckProfile(deck,t){
 const value=Math.max(0,Math.min(1,t));let low=0,high=deck.samples.length-1;
 while(high-low>1){const mid=(low+high)>>1;if(deck.samples[mid].t<value)low=mid;else high=mid;}
 const a=deck.samples[low],b=deck.samples[high],blend=(value-a.t)/(b.t-a.t);
 return {centerY:a.centerY+(b.centerY-a.centerY)*blend,crossfall:a.crossfall+(b.crossfall-a.crossfall)*blend};
}
export function hasReviewedDeck(feature){
 return feature?.transportSurfaceModel?.endpointPolicy==='reviewed_deck_profile'&&
  !!feature.transportSurfaceModel.surveyedSurface?.deckProfile;
}
export function hasReviewedPavement(feature){
 return feature?.transportSurfaceModel?.endpointPolicy==='reviewed_pavement_profile'&&
  !!feature.transportSurfaceModel.surveyedSurface?.pavementProfile;
}
