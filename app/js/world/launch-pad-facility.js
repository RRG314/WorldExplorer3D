import {LC39B_MAST_OUTLINES} from './launch-pad-survey.js';

export function prepareLaunchPadBuildingWays(ctx,ways,nodes,radius){
 const center=ctx.geoToWorld(28.62725,-80.62085);
 if(!Number.isFinite(radius)||Math.hypot(center.x,center.z)>radius-600)return ways;
 const ids=new Set(LC39B_MAST_OUTLINES.map(m=>m.sourceId));
 return ways.filter(way=>!ids.has(String(way.tags?._sourceFeatureId||way.id||'')));
}
