import { canonicalFact, createWorldCellFacts, worldCellBounds } from '../earth-core/world-cell-facts.js';
import { captureTransportTerrain } from '../terrain/transport-terrain-snapshot.js';

export const worldFactFrame = appCtx => ({ origin: { lat: appCtx.LOC.lat, lon: appCtx.LOC.lon },
  axes: { x: 'east', y: 'up', z: 'south' }, units: 'world-units',
  metersPerWorldUnit: appCtx.METERS_PER_WORLD_UNIT, scaleWorldUnitsPerDegree: appCtx.SCALE });
const intersects = (a, b) => a && a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
const pointIn = (p, b) => p && p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
const point = p => ({ x: p.x, z: p.z });
const boundsFor = points => points?.length ? points.reduce((b, p) => ({ minX: Math.min(b.minX, p.x),
  maxX: Math.max(b.maxX, p.x), minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z) }),
  { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }) : null;

function regionalBuildingFacts(appCtx, bounds) {
  const records=[];
  for(const root of appCtx.terrainGroup?.children||[]){
    if(!root.userData?.isFarMappedContext)continue;
    root.traverse(mesh=>{
      const geometry=mesh.geometry;if(!geometry)return;
      const attributes=(start,count)=>Object.fromEntries(Object.entries(geometry.attributes)
        .filter(([name])=>['position','normal','color','regionalStyle','regionalLayout'].includes(name))
        .map(([name,attribute])=>[name,{itemSize:attribute.itemSize,normalized:attribute.normalized===true,
          values:attribute.array.subarray(start*attribute.itemSize,(start+count)*attribute.itemSize)}]));
      const position={x:mesh.position.x,y:mesh.position.y,z:mesh.position.z};
      if(mesh.isInstancedMesh){
        const box=geometry.boundingBox;
        if(!box||!intersects({minX:box.min.x+position.x,maxX:box.max.x+position.x,
          minZ:box.min.z+position.z,maxZ:box.max.z+position.z},bounds))return;
        records.push({kind:'regional-instances',sourceIds:mesh.userData.sourceBuildingIds,position,
          attributes:attributes(0,geometry.attributes.position.count),indices:geometry.getIndex()?.array||null,
          transforms:mesh.instanceMatrix.array,colors:mesh.instanceColor?.array||null});
      }else for(const range of geometry.userData.regionalBuildingRanges||[]){
        if(!intersects(range.bounds,bounds))continue;
        records.push({kind:'regional-footprint',id:range.id,position,
          attributes:attributes(range.vertexStart,range.vertexCount),
          indices:geometry.getIndex().array.slice(range.indexStart,range.indexStart+range.indexCount).map(i=>i-range.vertexStart)});
      }
    });
  }
  return records;
}

// Read on demand from accepted authorities. No second city copy or sampled
// replacement terrain is retained. A cross-cell feature keeps its entire source
// geometry and identity in each export, rather than receiving a clipped identity.
export function capturePublishedCell(appCtx, publication, key) {
  if (appCtx.worldPublication !== publication) return null;
  const bounds = worldCellBounds(key);
  const buildings = (appCtx.buildings || []).filter(b => intersects(b, bounds)).map(b => ({
    id: String(b.sourceBuildingId || ''), footprint: (b.surfaceFootprint || b.pts || []).map(point),
    height: b.height, baseY: b.baseY, minY: b.minY, maxY: b.maxY,
    colliderDetail: b.colliderDetail, collisionKind: b.collisionKind, allowsPassageBelow: b.allowsPassageBelow,
    buildingPartKind: b.buildingPartKind, buildingType: b.buildingType, name: b.name, address: b.address,
    heightSource: b.heightSource, roofShape: b.roofShape, roofHeight: b.roofHeight,
    roofHeightSource:b.roofHeightSource,levels:b.levels,levelsSource:b.levelsSource,minLevels:b.minLevels,
    geometrySource:b.geometrySource,metadataSourceId:b.metadataSourceId,
    provenance: b.buildingProvenance, semantics: b.buildingSemantics, structure: b.structureSemantics
  }));
  const ids = new Set(buildings.map(b => b.id));
  const roads = (appCtx.roads || []).filter(r => intersects(r.bounds || boundsFor(r.pts), bounds)).map(r => ({
    id: String(r.sourceFeatureId || r.id || ''), points: r.pts.map(point), width: r.width,
    sourceNodeIds: r.sourceNodeIds, source: r.transportRecord, structure: r.structureSemantics,
    walkable: r.walkable, driveable: r.driveable,
    surface: r.transportSurfaceModel ? {
      schemaVersion: r.transportSurfaceModel.schemaVersion || 1,
      distances: r.transportSurfaceModel.distances, centerHeights: r.transportSurfaceModel.centerHeights,
      leftHeights: r.transportSurfaceModel.leftHeights, rightHeights: r.transportSurfaceModel.rightHeights
    } : null
  }));
  const entrances = (appCtx.buildingEntranceCatalog?.entrances || []).filter(e => ids.has(String(e.buildingSourceId)) || pointIn(e, bounds));
  const water = (appCtx.waterAreas || []).filter(w => intersects(w.bounds || boundsFor(w.pts), bounds)).map(w => ({
    id: String(w.registryId || ''), points: (w.pts || []).map(point), holes: (w.holes || []).map(ring => ring.map(point)),
    provenance: w.registryProvenance, datum: w.datum, kind: w.waterKind,
    surfaceY:w.surfaceY,area:w.area,sourceFeatureId:w.sourceFeatureId,geometrySource:w.geometrySource,access:w.access
  }));
  const terrain = captureTransportTerrain(appCtx);
  terrain.meshes = terrain.meshes.filter(mesh => {
    const a = mesh.positions;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < a.length; i += 3) {
      minX = Math.min(minX, a[i] + mesh.position.x); maxX = Math.max(maxX, a[i] + mesh.position.x);
      minZ = Math.min(minZ, a[i + 2] + mesh.position.z); maxZ = Math.max(maxZ, a[i + 2] + mesh.position.z);
    }
    return intersects({ minX, maxX, minZ, maxZ }, bounds);
  });
  return createWorldCellFacts({ requestId: publication.requestId, key, frame: worldFactFrame(appCtx),
    coverage: { source: 'accepted-selected-area', terrain: 'original-published-buffers-and-grid',
      interactive: 'pinned-selected-district', regionalBuildings: 'presentation-only',
      completeness: 'published-data-only' },
    layers: { terrain, buildings, regionalBuildings:regionalBuildingFacts(appCtx,bounds), transport: roads,
      transportGeometry:(appCtx.worldSnapshotStore?.regionFactsAt(bounds)||[]).map(facts=>facts.layers.transport), entrances, hydrology: water,
      places: (appCtx.poiLifecycle?.records || []).filter(p => pointIn(p.position, bounds)),
      landuse: (appCtx.landuses || []).filter(l => intersects(l.bounds || boundsFor(l.pts), bounds))
        .map(l => ({ id: l.sourceFeatureId || l.id, points: (l.pts || []).map(point),
          holes:(l.holeRings||[]).map(ring=>ring.map(point)),type: l.type, provenance: l.provenance,
          tags:l.tags,geometrySource:l.geometrySource,presentationOwner:l.presentationOwner,semanticOnly:l.semanticOnly })) } });
}

export function ownPublishedDistrict(appCtx, publication) {
  const catalog = appCtx.buildingEntranceCatalog;
  const byBuilding = appCtx.buildingEntranceByBuilding;
  const facades = appCtx.buildingFacadeEntrances;
  const poiLifecycle = appCtx.poiLifecycle;
  return appCtx.worldSnapshotStore.ownRegion({ key: 'interactive-district',
    expectedRequestId: publication.requestId,
    layers: ['buildings', 'structures', 'entrances', 'places'],
    // Interactive identities stay pinned while a room, save, or activity can
    // refer to them. Regional visual retirement never deletes player overlays.
    retire() {
      // The active POI array changes during play; its lifecycle identity, not
      // the array captured at load, determines which generation owns it.
      const ownsPois = appCtx.poiLifecycle === poiLifecycle;
      if (appCtx.buildingEntranceCatalog === catalog) appCtx.buildingEntranceCatalog = null;
      if (appCtx.buildingEntranceByBuilding === byBuilding) appCtx.buildingEntranceByBuilding = null;
      if (appCtx.buildingFacadeEntrances === facades) appCtx.buildingFacadeEntrances = null;
      if (ownsPois) Object.assign(appCtx, { poiLifecycle: null, functionalPoiRecords: [], activeFunctionalPois: [],
        poiTenanciesByBuilding: null, refreshActiveFunctionalPois: null });
    }
  });
}

// A canonical POI input is also the browser lifecycle compiler's input. Keep
// normalization/association authority there rather than inventing port semantics.
export function portablePoiInputs(pois) {
  return canonicalFact(pois.map(p => ({ x: p.x, z: p.z, name: p.name, type: p.type, tags: p.tags,
    sourceFeatureId: p.sourceFeatureId, sourceElementType: p.sourceElementType, sourceElementId: p.sourceElementId,
    provider: p.provider, source: p.source, license: p.license, attribution: p.attribution,
    id: p.id, elementType: p.elementType, elementId: p.elementId, confidence: p.confidence,
    operatingStatus: p.operatingStatus, operating_status: p.operating_status,
    healthcare: p.healthcare, mappedType: p.mappedType, openingHours: p.openingHours })));
}
