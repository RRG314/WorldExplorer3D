// Preserve the reviewed exterior as source; subtract interior volumes/doorways
// offline, never during a frame. Retain and interpolate every vertex attribute.
import {NodeIO} from '@gltf-transform/core';
import {prune,weld,dedup} from '@gltf-transform/functions';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RESEARCH_HULL_CUTS} from '../app/js/boat-mode/research/interior-plan.js';
import {updateModelAssetRevisions} from './update-model-asset-revisions.mjs';
const path='app/assets/models/marine/research-vessel',bytes=await readFile(`${path}/rcrv.glb`);
const io=new NodeIO(),doc=await io.readBinary(bytes),buffer=doc.getRoot().listBuffers()[0];
function split(poly,axis,bound,sign){const inside=[],outside=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-bound)*sign,db=(b[axis]-bound)*sign;(da>=0?inside:outside).push(a);if((da<0)!==(db<0)){const f=da/(da-db),p=a.map((v,j)=>v+(b[j]-v)*f);inside.push(p);outside.push(p);}}return {inside,outside};}
for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
 const names=['POSITION',...p.listSemantics().filter(n=>n!=='POSITION')],attrs=names.map(n=>p.getAttribute(n)),sizes=attrs.map(a=>a.getElementSize()),positionIndex=names.indexOf('POSITION');
 if(positionIndex!==0)throw Error('Expected position first');
 const index=p.getIndices(),count=index?.getCount()||attrs[0].getCount(),output=attrs.map(()=>[]);
 function emit(poly){for(let j=1;j+1<poly.length;j++)for(const v of [poly[0],poly[j],poly[j+1]]){let offset=0;for(let k=0;k<attrs.length;k++){output[k].push(...v.slice(offset,offset+sizes[k]));offset+=sizes[k];}}}
 for(let i=0;i<count;i+=3){let polygons=[[0,1,2].map(j=>attrs.flatMap(a=>a.getElement(index?index.getScalar(i+j):i+j,[])))];
  for(const {min,max} of RESEARCH_HULL_CUTS){const kept=[];for(let poly of polygons){if([0,1,2].some(a=>Math.max(...poly.map(v=>v[a]))<min[a]||Math.min(...poly.map(v=>v[a]))>max[a])){kept.push(poly);continue;}
   for(let axis=0;axis<3&&poly.length;axis++)for(const [bound,sign] of [[min[axis],1],[max[axis],-1]]){const parts=split(poly,axis,bound,sign);if(parts.outside.length>=3)kept.push(parts.outside);poly=parts.inside;}
  }polygons=kept;}for(const poly of polygons)emit(poly);
 }
 p.setIndices(null);for(let i=0;i<attrs.length;i++)p.setAttribute(names[i],doc.createAccessor().setType(attrs[i].getType()).setBuffer(buffer).setArray(new Float32Array(output[i])));
}
await doc.transform(weld(),dedup(),prune());const result=await io.writeBinary(doc);await writeFile(`${path}/rcrv-walkable.glb`,result);
await writeFile(`${path}/INTERIOR-PROVENANCE.json`,JSON.stringify({source:'rcrv.glb',sourceSha256:createHash('sha256').update(bytes).digest('hex'),output:'rcrv-walkable.glb',outputSha256:createHash('sha256').update(result).digest('hex'),license:'CC-BY-4.0',author:'Oregon State University Extension Service / Alan Dennis',adaptation:'Additional main-deck entrance, internal stair openings and enclosed science/crew/bridge spaces. Authored game arrangement, not an exact commissioned-vessel replica.',cuts:RESEARCH_HULL_CUTS},null,2)+'\n');
await updateModelAssetRevisions();console.log({bytes:result.length});
