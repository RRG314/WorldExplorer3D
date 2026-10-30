import {unionCarriageway} from './street-carriageway.js';
import {meshPavementTile} from './street-pavement.js';
import {streetPolygonKernel as clip} from './street-polygon-kernel.js';
import {compileStreetEdgeRecipe} from './street-edge-recipe.js';
import {resolveStreetEdgeBands} from './street-edge-bands.js';
import {indexPavementPositions} from '../pavement-indexed-mesh.js';

// One nonoverlapping top per cell. The terrain-plane partition is temporary
// height integration while the regional grade solver is being migrated; it is
// explicit here and must not be reported as independent road-profile authority.
export function meshCarriagewayTile(tile, sampleTop, partitionSurface, {polygons:preparedPolygons,edgeFaces} = {}) {
  // A tile repeats boundary vertices in adjacent triangles and terrain cells.
  // Reuse exact numeric coordinates for this synchronous build only. The
  // shared world-height cache remains authoritative across terrain revisions.
  const columns=new Map();
  const sampleOnce=(x,z)=>{
    let column=columns.get(x);
    if(column?.has(z))return column.get(z);
    const height=sampleTop(x,z);
    if(Number.isFinite(height)){
      if(!column)columns.set(x,column=new Map());
      column.set(z,height);
    }
    return height;
  };
  const polygons=preparedPolygons || unionCarriageway(tile);
  if(!polygons.length)return {positions:new Float32Array(),indices:new Uint16Array(),polygons};
  // Terrain partitioning below supplies every actual surface crease. An
  // additional fixed 32-unit grid only creates redundant interior triangles.
  const cellSize=Math.max(tile.bounds.maxX-tile.bounds.minX,tile.bounds.maxZ-tile.bounds.minZ);
  const authored=edgeFaces===undefined?compileStreetEdgeRecipe(tile):null;
  edgeFaces=edgeFaces??authored.faces;
  const domain=authored?.faces.length?clip.difference(polygons,authored.polygons):polygons;
  const bands=edgeFaces.length?resolveStreetEdgeBands(edgeFaces,domain,tile.bounds):null,
    asphalt=bands?.footprint.length?clip.difference(polygons,bands.footprint):polygons;
  const compile=shapes=>{
    if(!shapes.length)return {positions:new Float32Array(),indices:new Uint16Array()};
    const mesh=meshPavementTile(tile,shapes,sampleOnce,{cellSize,curbHeight:0,includeCurbs:false,includeTriangles:false});
    const partitioned=partitionSurface(mesh.vertices,sampleOnce);
    if(!partitioned)throw new Error(`Carriageway ${tile.key} has incomplete or overlapping terrain support: ${JSON.stringify(partitionSurface.lastCoverage || {})}`);
    return indexPavementPositions(partitioned);
  };
  const result={...compile(asphalt),polygons};
  if(bands){
    const positions=[],indices=[],colors=[];
    for(const band of bands.surfaces){
      const mesh=compile(band.polygons),offset=positions.length/3;
      if(offset+mesh.positions.length/3>250000)throw Error('street_edge_band_capacity');
      for(let i=0;i<mesh.positions.length;i+=3){
        const x=mesh.positions[i],z=mesh.positions[i+2],lift=band.a*x+band.b*z+band.c;
        positions.push(x,mesh.positions[i+1]+lift,z);colors.push(...band.color);
      }
      for(const index of mesh.indices)indices.push(offset+index);
    }
    result.edgeBands={positions:new Float32Array(positions),indices:new Uint32Array(indices),colors:new Uint8Array(colors)};
  }
  return result;
}
