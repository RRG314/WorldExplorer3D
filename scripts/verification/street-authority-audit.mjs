import {createStreetFrontageGrading} from '../../app/js/terrain/street-frontage-grading.js';
import {createTerrainHeightSamplingApi} from '../../app/js/terrain/height-sampling.js';
import {createCompiledRoadSurfaceSampler,createRoadTerrainConformanceAudit,recordAtGradeRoadTerrainConformance,finalizeRoadTerrainConformanceAudit} from '../../app/js/terrain/rebuild.js';
const road=(z,y)=>({pts:[{x:0,z},{x:20,z}],width:4,surfaceBias:.18,structureSemantics:{terrainMode:'at_grade'},transportSurfaceModel:{distances:new Float32Array([0,20]),pathDistances:new Float32Array([0,20]),centerHeights:new Float32Array([y,y]),leftHeights:new Float32Array([y,y]),rightHeights:new Float32Array([y,y])}});
const a=road(0,2),b=road(6,6);
const buildings=[0,10].map(x=>({pts:[{x,z:-12},{x:x+10,z:-12},{x:x+10,z:-10},{x,z:-10}]}));
a.type=b.type='residential';a.tags=b.tags={sidewalk:'both'};
const frontage=createStreetFrontageGrading(buildings,1);
const terrain=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:[a,b],streetFrontageGrading:frontage},elevationWorldYAtWorldXZ:()=>0});
const ground=(x,z)=>terrain.applyStructureTerrainCuts(x,z,0);
const render=createCompiledRoadSurfaceSampler(a,(x,z)=>ground(x,z)+.18);
const vertices=[];const samples=[];
for(const z of [-2,0,1,2]){const y=render(10,z);vertices.push(10,y,z);samples.push({x:10,z,engineeredRoadY:2,renderedRoadY:y,departure:y-2});}
const audit=createRoadTerrainConformanceAudit();recordAtGradeRoadTerrainConformance(audit,a,vertices,ground);
console.log(JSON.stringify({purpose:'Architecture counterexample, not a city reproduction',fixture:'Two disjoint, parallel 4-unit carriageways 6 units apart, flat profiles at heights 2 and 6, attached facades ten units beyond the first centerline',samples,existingConformanceAudit:finalizeRoadTerrainConformanceAudit(audit)},null,2));
