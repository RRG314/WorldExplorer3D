import {RACING_VENUE_SOURCES,loadRacingVenueSource,prepareVenueSourceMerge} from '../../app/js/racing/venue-source-packs.js';
import {roadSourceSurvey,reviewedRoadTransportRecord} from '../../app/js/world/road-source-survey.js';
import {reviewedDeckSurveyInWorld} from '../../app/js/world/reviewed-deck-world-profile.js';
import {normalizeTransportSource} from '../../app/js/world/compiler/transport-source-normalizer.js?v=4';
import {compileGroundArtifact} from '../../app/js/terrain/ground-artifact.js';
import {sampleDistrictGroundElevationMeters as sample} from '../../app/js/world/compiler/district-ground-model.js';
import {earthCoordinateFrame} from '../../app/js/earth-core/coordinate-frame.js';
import {geographicToWebMercatorMeters as mercator} from '../../app/js/terrain/source-contract.js';
import {compileTransportSurfaceModel as compile,attachCompiledTransportSurface as attach,packCompiledTransportSurfaces as pack} from '../../app/js/world/compiler/transport-surface-model.js?v=25';
import {createTerrainHeightSamplingApi} from '../../app/js/terrain/height-sampling.js';
import {prepareReviewedDetailedTerrainMesh} from '../../app/js/terrain/reviewed-detailed-refinement.js';
import {createRoadBoundaryPartition} from '../../app/js/terrain/road-boundary-triangulation.js';
import {prepareCarriagewayTiles} from '../../app/js/world/compiler/street-carriageway.js';
import {meshCarriagewayTile} from '../../app/js/world/compiler/street-carriageway-mesh.js';
import {createPavementTerrainPartition} from '../../app/js/world/pavement-terrain-partition.js';

// Compact reproduction of the changed native curved bank and published mesh.
// Uses the pinned venue/ground and existing owners; no copied world or artwork.
export async function createDaytonaPavementSection({fetchImpl=globalThis.fetch}={}){
 const d=RACING_VENUE_SOURCES.find(d=>d.id==='daytona-tri-oval'),source=await loadRacingVenueSource(d,{fetchImpl}),read=async url=>{const r=await fetchImpl(url);return JSON.parse(await r.text());},
  manifest=await read('/app/assets/ground/daytona/ground-manifest.json'),artifact=await read('/app/assets/ground/daytona/ground-artifact.json'),ground=compileGroundArtifact({manifest,artifact});
 if(ground.status!=='accepted')throw Error('Controlled native source requires accepted ground');
 const merged=prepareVenueSourceMerge({},source,d,{status:'accepted',artifactIds:[d.groundArtifactId],contentSha256s:[d.groundContentSha256]}),frame=earthCoordinateFrame(d.anchor,100000),unit=1.11,
  native=(x,z)=>{const g=frame.toGeographic(x,z),p=mercator(g.lat,g.lon);return sample(ground.model,p.eastingMeters,p.northingMeters)/unit;},roads=[];
 for(const id of source.layout.wayIds){const raw=source.ways.find(w=>w.id===id),way=merged.data.elements.find(w=>w.type==='way'&&w.id===id),pts=raw.geometry.map(g=>frame.toWorld(g.lat,g.lon)),survey=reviewedDeckSurveyInWorld(roadSourceSurvey(way),pts,{metersPerWorldUnit:unit}),record=reviewedRoadTransportRecord(normalizeTransportSource({sourceId:`osm:way:${id}`,id,type:'way',providerNamespace:'osm',completeness:'lossless',geometryProvenance:'osm-overpass'},way.tags),survey),road={auditIndex:roads.length,sourceFeatureId:`osm:way:${id}`,sourceNodeIds:way.nodes,pts,width:record.crossSection.widthMeters/unit,metersPerWorldUnit:unit,surfaceBias:.18,type:'raceway',structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:survey,transportRecord:record};attach(road,compile(road,native,{reviewedSurfacePhase:'preparation'}));roads.push(road);}
 pack(roads);const grade=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:roads},elevationWorldYAtWorldXZ:native}),n=16,p=[];
 for(let row=0;row<=n;row++)for(let col=0;col<=n;col++){const x=320+col*16,z=-700+row*16,y=native(x,z);if(!Number.isFinite(y))throw Error('Controlled native window incomplete');p.push(x,y,z);}
 const initial={position:{x:0,y:0,z:0},geometry:{parameters:{widthSegments:n},attributes:{position:{array:Float32Array.from(p),count:p.length/3}}}},segments=roads.flatMap(r=>r.pts.slice(1).map((b,i)=>({a:r.pts[i],b,innerRadius:r.transportRecord.crossSection.pavementSections.maximumExtent+8/unit,outerRadius:r.transportRecord.crossSection.pavementSections.maximumExtent+40/unit}))),
  staged=await prepareReviewedDetailedTerrainMesh(initial,{segments,scale:1/unit,sampleGround:native,gradeGround:grade.applyStructureTerrainCuts,partitionTriangle:createRoadBoundaryPartition(roads,d)}),mesh={visible:true,position:{x:0,y:0,z:0},userData:{isTerrainMesh:true,terrainTile:{},reviewedTerrainCells:staged.cells},geometry:{parameters:{widthSegments:n},attributes:{position:{array:staged.positions,count:staged.positions.length/3,getX:i=>staged.positions[i*3],getY:i=>staged.positions[i*3+1],getZ:i=>staged.positions[i*3+2]}},getIndex:()=>({array:staged.indices})}},
  api=createTerrainHeightSamplingApi({appCtx:{terrainGroup:{children:[mesh]},TERRAIN_SEGMENTS:n},elevationWorldYAtWorldXZ:()=>NaN}),partition=createPavementTerrainPartition([mesh]),road=roads.find(r=>r.sourceFeatureId==='osm:way:352070316'),tiles=prepareCarriagewayTiles([road]).filter(t=>['3:-6','3:-5'].includes(t.key)),batches=[];
 try{for(const tile of tiles)batches.push(meshCarriagewayTile(tile,(x,z)=>api.terrainMeshHeightAt(x,z)+.18,partition));}finally{partition.dispose();}
 return {road,terrain:{positions:staged.positions,indices:staged.indices},batches,native};
}
