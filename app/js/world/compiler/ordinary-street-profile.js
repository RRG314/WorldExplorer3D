import {connectedSideGroups} from './transport-junction-profile.js?v=21';

// Ordinary street nodes have terrain-owned elevations. Keep these constraints
// separate from bridge approaches so a street junction cannot promote an
// entire neighborhood to engineered structure geometry.
export function assignOrdinaryStreetJunctions(features,network,sampleTerrain) {
  const byId=new Map(features.map(f=>[String(f.transportGraphRef?.featureId||''),f]));
  for(const feature of features)feature.ordinaryStreetAnchors=[];
  let nodes=0;
  for(const group of connectedSideGroups(network?.connections||[])){
    const entries=group.map(side=>({side,feature:byId.get(String(side.featureId||''))}));
    if(entries.length<2||entries.some(e=>!e.feature||e.feature.structureSemantics?.terrainMode!=='at_grade'||e.feature.transportRecord?.routeState==='incomplete'))continue;
    // The graph supplies the common station. Avoid averaging independently
    // fitted road heights: that is the defect this publication replaces.
    const point=entries[0].side.point;
    if(!point)continue;
    const terrain=sampleTerrain(point.x,point.z);
    if(!Number.isFinite(terrain))continue;
    const target=terrain+Math.max(...entries.map(e=>Number(e.feature.surfaceBias)||.08));
    for(const {side,feature} of entries){
      if(!Number.isFinite(side.distanceAlong))continue;
      feature.ordinaryStreetAnchors.push({distance:side.distanceAlong,targetSurfaceY:target});
    }
    nodes++;
  }
  return {nodes};
}

// Fit a continuous profile through physical street nodes. A universal 12%
// ceiling cannot connect the endpoints of a genuinely steeper street. Use
// the minimum feasible grade for its measured nodes and keep those nodes
// fixed, without moving elevations through the rest of the road network.
export function fitOrdinaryStreetProfile(distances,heights,anchors,minimumGrade=.12) {
  if(!distances.length)return {heights:new Float32Array(heights),maximumGrade:minimumGrade};
  const fixed=new Map();
  for(const anchor of anchors){
    if(!Number.isFinite(anchor.distance)||!Number.isFinite(anchor.targetSurfaceY))continue;
    let nearest=0;
    for(let i=1;i<distances.length;i++)if(Math.abs(distances[i]-anchor.distance)<Math.abs(distances[nearest]-anchor.distance))nearest=i;
    fixed.set(nearest,anchor.targetSurfaceY);
  }
  const stations=[...fixed.entries()].sort((a,b)=>a[0]-b[0]);
  if(stations.length<2)return {heights:new Float32Array(heights),maximumGrade:minimumGrade};
  const result=new Float64Array(heights);
  let maximumGrade=minimumGrade;
  for(let n=1;n<stations.length;n++){
    const [start,first]=stations[n-1],[end,last]=stations[n],run=distances[end]-distances[start];
    if(run<=1e-8)continue;
    const grade=Math.max(minimumGrade,Math.abs(last-first)/run);
    maximumGrade=Math.max(maximumGrade,grade);
    result[start]=first;result[end]=last;
    for(let i=start+1;i<end;i++){
      const left=distances[i]-distances[start],right=distances[end]-distances[i];
      const lower=Math.max(first-grade*left,last-grade*right),upper=Math.min(first+grade*left,last+grade*right);
      result[i]=Math.max(lower,Math.min(upper,result[i]));
    }
    for(let i=start+1;i<=end;i++){
      const delta=grade*(distances[i]-distances[i-1]);
      result[i]=Math.max(result[i-1]-delta,Math.min(result[i-1]+delta,result[i]));
    }
    for(let i=end-1;i>=start;i--){
      const delta=grade*(distances[i+1]-distances[i]);
      result[i]=Math.max(result[i+1]-delta,Math.min(result[i+1]+delta,result[i]));
    }
  }
  return {heights:Float32Array.from(result),maximumGrade};
}
