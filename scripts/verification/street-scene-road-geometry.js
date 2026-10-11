import {prepareCarriagewayTiles} from '../../app/js/world/compiler/street-carriageway.js';
import {meshCarriagewayTile} from '../../app/js/world/compiler/street-carriageway-mesh.js';
import {createPavementTerrainPartition} from '../../app/js/world/pavement-terrain-partition.js';

// Bounded verification scenes use the current unioned road compiler. The old
// per-road ribbon export was retired from production and is not a valid fixture.
export function compileStreetSceneRoads(roads,terrainMesh,ground){
 const partition=createPavementTerrainPartition([terrainMesh]);
 const positions=terrainMesh.geometry.attributes.position.array;
 const xs=[],zs=[];for(let i=0;i<positions.length;i+=3){xs.push(positions[i]);zs.push(positions[i+2]);}
 const bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
 try{return prepareCarriagewayTiles(roads).flatMap(tile=>{
  const b={minX:Math.max(tile.bounds.minX,bounds.minX),maxX:Math.min(tile.bounds.maxX,bounds.maxX),minZ:Math.max(tile.bounds.minZ,bounds.minZ),maxZ:Math.min(tile.bounds.maxZ,bounds.maxZ)};
  return b.minX<b.maxX&&b.minZ<b.maxZ?[meshCarriagewayTile({...tile,bounds:b},(x,z)=>ground(x,z)+.18,partition)]:[];
 });}
 finally{partition.dispose();}
}
