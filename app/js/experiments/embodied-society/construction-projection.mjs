import { BLOCK_SHAPES, blockDocumentIdFromCoords, createBlockShapeGeometry } from '../../block-builder/catalog.js?v=2';
import { createBuildCollisionQueries } from '../../block-builder/collision.js?v=1';

const blockKey=(x,y,z)=>`${x}|${y}|${z}`;
const columnKey=(x,z)=>`${x}|${z}`;
const shapes=new Set(BLOCK_SHAPES.map(shape=>shape.id));

// A disposable view of committed research construction. Uses the same geometry
// and collision queries as Blocks, with separate maps and no player persistence.
// The host must pause commands if reconcile throws, then retry the SAME snapshot.
export function createConstructionProjection({THREE,scene,runId,maxStructures=200}) {
  if(!THREE || !scene?.add || !scene?.remove || !runId || !Number.isInteger(maxStructures) || maxStructures<1 || maxStructures>200)throw new Error('Invalid construction projection host.');
  const buildBlocks=new Map(),buildColumns=new Map();
  const collision=createBuildCollisionQueries({blockKey,columnKey,buildBlocks,buildColumns,toGridCoord:Math.round,toWorldCoord:g=>g});
  let group=null,signature=null,disposed=false;
  function release(target){target?.traverse(part=>{part.geometry?.dispose();part.material?.dispose();});}
  function reconcile(snapshot) {
    if(disposed || snapshot?.runId!==runId)throw new Error('Wrong or disposed research projection.');
    const records=Object.values(snapshot.structures??{}).sort((a,b)=>a.id.localeCompare(b.id));
    if(records.length>maxStructures)throw new Error('Construction projection capacity exceeded.');
    const seen=new Set();
    for(const record of records) {
      const b=record.block;
      if(!b || !Number.isInteger(b.gx) || !Number.isInteger(b.gz) || !Number.isFinite(b.gy) || !Number.isInteger(b.gy*2) || !shapes.has(b.shape) || ![0,1,2,3].includes(b.rotation) ||
          record.cellId!==blockDocumentIdFromCoords(b.gx,b.gy,b.gz) || seen.has(record.cellId))throw new Error('Invalid committed construction geometry.');
      seen.add(record.cellId);
    }
    const nextSignature=JSON.stringify(records.map(r=>[r.id,r.block]));
    if(signature===nextSignature)return {structures:records.length,changed:false};
    const nextGroup=new THREE.Group(),nextBlocks=new Map(),nextColumns=new Map();
    try {
      for(const record of records) {
        const b=record.block,{geometry,yOffset}=createBlockShapeGeometry(THREE,b.shape);
        const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x9b6a45}));
        nextGroup.add(mesh);mesh.position.set(b.gx,b.gy+yOffset,b.gz);mesh.rotation.y=b.rotation*Math.PI/2;
        mesh.userData={researchRunId:runId,structureId:record.id,shape:b.shape,rotation:b.rotation};
        nextBlocks.set(blockKey(b.gx,b.gy,b.gz),mesh);
        const key=columnKey(b.gx,b.gz);if(!nextColumns.has(key))nextColumns.set(key,new Set());nextColumns.get(key).add(b.gy);
      }
      scene.add(nextGroup);
    } catch(error){scene.remove(nextGroup);release(nextGroup);throw error;}
    if(group){scene.remove(group);release(group);}
    group=nextGroup;signature=nextSignature;buildBlocks.clear();buildColumns.clear();
    for(const [key,value] of nextBlocks)buildBlocks.set(key,value);
    for(const [key,value] of nextColumns)buildColumns.set(key,value);
    return {structures:records.length,changed:true};
  }
  return Object.freeze({...collision,reconcile,
    dispose(){if(group){scene.remove(group);release(group);}group=null;buildBlocks.clear();buildColumns.clear();disposed=true;}
  });
}
