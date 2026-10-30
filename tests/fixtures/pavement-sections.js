import {validateRoadPavementSections,roadPavementSectionsInWorld} from '../../app/js/world/road-pavement-sections.js';
import {compileTransportSurfaceModel,attachCompiledTransportSurface} from '../../app/js/world/compiler/transport-surface-model.js?v=25';
import {createTerrainHeightSamplingApi} from '../../app/js/terrain/height-sampling.js';
import {prepareReviewedDetailedTerrainMesh} from '../../app/js/terrain/reviewed-detailed-refinement.js';
import {createRoadBoundaryPartition} from '../../app/js/terrain/road-boundary-triangulation.js';
import {createTransportDetailCompiler} from '../../app/js/terrain/transport-detail-compiler.js';

// A controlled bank/apron uses the real compiler, terrain publication and road
// mesher. It does not claim native venue or real-input gameplay acceptance.
export async function createPavementSectionsFixture(){
 const slope=Math.tan(31*Math.PI/180),pts=[{x:0,z:0},{x:0,z:10},{x:0,z:40}],binding={venueId:'controlled-oval',sourceFeatureId:'osm:way:11',sourceSha256:'a'.repeat(64),nodeIds:[1,2,3]},
  raw={version:1,...binding,observationSha256:'b'.repeat(64),bankingReference:{url:'https://www.nascar.com/gallery/inside-look-at-all-isc-tracks/'},samples:[{segment:0,fraction:0},{segment:1,fraction:1}].map(s=>({...s,positiveMeters:3,negativeMeters:15,bankNegativeMeters:6,bankAngleDegrees:31}))},
  profile=roadPavementSectionsInWorld(validateRoadPavementSections(raw,binding),pts,1),venue={sourceFeatureIds:[binding.sourceFeatureId]},evidence={version:1,venueId:binding.venueId,venueSource:venue,sourceFeatureId:binding.sourceFeatureId,surfaceModel:'banked-road-v1',maximumCrossfall:.7,usableWidthMeters:6,groundArtifactId:'controlled-native',groundContentSha256:'c'.repeat(64),pavementSections:profile,terrainEdgePolicy:'fitted-pavement-boundary-v1'},
  road={auditIndex:0,sourceFeatureId:binding.sourceFeatureId,sourceNodeIds:binding.nodeIds,pts,width:18,surfaceBias:.18,metersPerWorldUnit:1,type:'raceway',structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:evidence,transportRecord:{crossSection:{widthMeters:18,pavementSections:profile}}},native=(x,z)=>500+z*.02+slope*Math.max(-6,Math.min(3,-x));
 attachCompiledTransportSurface(road,compileTransportSurfaceModel(road,native,{surfaceBias:.18,sampleStep:2}));
 const grade=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:[road]},elevationWorldYAtWorldXZ:native}),n=4,p=[];
 for(let row=0;row<=n;row++)for(let col=0;col<=n;col++){const x=-20+col*10,z=row*10;p.push(x,native(x,z),z);}
 const initial={position:{x:0,y:0,z:0},geometry:{parameters:{widthSegments:n},attributes:{position:{array:Float32Array.from(p),count:p.length/3}}}},
  staged=await prepareReviewedDetailedTerrainMesh(initial,{segments:[{a:pts[0],b:pts.at(-1),innerRadius:20,outerRadius:46}],sampleGround:native,gradeGround:grade.applyStructureTerrainCuts,partitionTriangle:createRoadBoundaryPartition([road],venue)}),
  terrain={meshes:[{position:{x:0,y:0,z:0},positions:staged.positions,indices:staged.indices,segments:n,userData:{isTerrainMesh:true,terrainTile:{},reviewedTerrainCells:[...staged.cells]}}],segments:n,portalMasks:[]},
  input={roads:[road],terrain,includeOverview:false},compiler=createTransportDetailCompiler(input);
 let batches;try{batches=compiler.initial.regions.flatMap(r=>r.batches);}finally{compiler.dispose();}
 return {road,profile,native,terrain,input,batches};
}
