import {unionCarriageway} from './street-carriageway.js';
import {meshPavementTile} from './street-pavement.js';
import {indexPavementPositions} from '../pavement-indexed-mesh.js';

// One nonoverlapping top per cell. The terrain-plane partition is temporary
// height integration while the regional grade solver is being migrated; it is
// explicit here and must not be reported as independent road-profile authority.
export function meshCarriagewayTile(tile, sampleTop, partitionSurface) {
  const polygons=unionCarriageway(tile);
  if(!polygons.length)return {positions:new Float32Array(),indices:new Uint16Array(),polygons};
  // Terrain partitioning below supplies every actual surface crease. An
  // additional fixed 32-unit grid only creates redundant interior triangles.
  const cellSize=Math.max(tile.bounds.maxX-tile.bounds.minX,tile.bounds.maxZ-tile.bounds.minZ);
  const mesh=meshPavementTile(tile,polygons,sampleTop,{cellSize,curbHeight:0,includeCurbs:false,includeTriangles:false});
  const partitioned=partitionSurface(mesh.vertices,sampleTop);
  if(!partitioned)throw new Error(`Carriageway ${tile.key} has incomplete or overlapping terrain support: ${JSON.stringify(partitionSurface.lastCoverage || {})}`);
  return {...indexPavementPositions(partitioned),polygons};
}
