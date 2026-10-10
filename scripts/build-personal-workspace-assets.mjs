import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds} from '@gltf-transform/functions';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const assets=[['wooden_table_02','workspace-table','Serhii Khromov'],['SchoolChair_01','workspace-chair','Ethan Place']];
const out='app/assets/models/interiors/personal-workspace';
const temporary=await mkdtemp(join(tmpdir(),'we3d-workspace-intake-'));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),manifest=[];
const digest=(bytes,kind='sha256')=>createHash(kind).update(bytes).digest('hex');
async function fetchBytes(url){
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||!['api.polyhaven.com','dl.polyhaven.org'].includes(parsed.hostname))throw Error('Unexpected asset host');
  const response=await fetch(url,{headers:{'User-Agent':'WorldExplorer3D-asset-intake/1.0'},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Asset download failed: ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>4*1024*1024)throw Error('Asset intake exceeded size budget');return bytes;
}
try {
  await mkdir(out,{recursive:true});
  for(const [source,id,author] of assets){
    const files=JSON.parse(await fetchBytes(`https://api.polyhaven.com/files/${source}`));
    const record=files.gltf?.['1k']?.gltf;if(!record)throw Error('No 1K glTF source');
    const root=join(temporary,id);await mkdir(root);
    const sourceFiles=[];
    for(const [path,entry] of [['scene.gltf',record],...Object.entries(record.include)]){
      if(path.startsWith('/')||path.split('/').includes('..'))throw Error('Unsafe relative asset path');
      const bytes=await fetchBytes(entry.url);
      if(bytes.length!==entry.size||digest(bytes,'md5')!==entry.md5)throw Error('Source asset digest mismatch');
      await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),bytes);
      sourceFiles.push({path,url:entry.url,bytes:bytes.length,sha256:digest(bytes)});
    }
    const doc=await io.read(join(root,'scene.gltf'));
    const triangles=doc.getRoot().listMeshes().reduce((sum,mesh)=>sum+mesh.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0);
    const bounds=getBounds(doc.getRoot().listScenes()[0]);
    const bytes=await io.writeBinary(doc);await writeFile(join(out,`${id}.glb`),bytes);
    manifest.push({id,source,sourceUrl:`https://polyhaven.com/a/${source}`,author,license:'CC0-1.0',licenseUrl:'https://polyhaven.com/license',
      retrievedAt:new Date().toISOString(),conversion:'Original 1K glTF and JPEG textures bundled into GLB. Geometry, materials and scale retained.',
      bytes:bytes.length,sha256:digest(bytes),triangles,bounds,sourceFiles});
  }
  await writeFile(join(out,'PROVENANCE.json'),JSON.stringify({schemaVersion:1,assets:manifest},null,2)+'\n');
  await writeFile(join(out,'LICENSE.txt'),'CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/\nWooden Table 02 by Serhii Khromov, Poly Haven\nSchool Chair 01 by Ethan Place, Poly Haven\nSource and file hashes: PROVENANCE.json\n');
  console.log(JSON.stringify(manifest.map(({id,bytes,triangles,bounds})=>({id,bytes,triangles,bounds})),null,2));
} finally {await rm(temporary,{recursive:true,force:true});}
