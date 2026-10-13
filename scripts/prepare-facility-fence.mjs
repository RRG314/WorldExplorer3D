import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,getBounds,prune,simplify,weld} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getModelAsset} from '../app/js/assets/model-asset-catalog.js';
const source='output/asset-intake/modular-chainlink-fence',out='app/assets/models/facilities/chainlink';
const hash=b=>createHash('sha256').update(b).digest('hex');
const receipt=JSON.parse(await readFile(`${source}/source-receipt.json`));
for(const file of receipt.files)if(hash(await readFile(`${source}/${file.name}`))!==file.sha256)throw Error('Fence source integrity mismatch');
const opacityUrl='https://dl.polyhaven.org/file/ph-assets/Models/png/1k/modular_chainlink_fence/modular_chainlink_fence_wire_opacity_1k.png';
let opacity;try{opacity=await readFile(`${source}/wire-opacity.png`);}catch{const r=await fetch(opacityUrl);if(!r.ok)throw Error(`Opacity download ${r.status}`);opacity=Buffer.from(await r.arrayBuffer());}
if(createHash('md5').update(opacity).digest('hex')!=='60de816363ee08a40d88a2db5aac4c9c')throw Error('Unreviewed opacity source');
await writeFile(`${source}/wire-opacity.png`,opacity);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read(`${source}/modular_chainlink_fence.gltf`),root=doc.getRoot(),scene=root.listScenes()[0];
const panel=root.listNodes().find(n=>n.getName()==='modular_chainlink_fence_double'),post=root.listNodes().find(n=>n.getName()==='modular_chainlink_fence_post');
if(!panel||!post)throw Error('Expected authored modular parts missing');
for(const n of scene.listChildren())scene.removeChild(n);
panel.setName('Fence panel · 2 metre bay').setTranslation([2,0,0]);post.setName('Fence post').setTranslation([0,0,0]);
scene.addChild(panel).addChild(post);
// The provider glTF omits the separately published opacity map. Pack that map
// into the original color image; masked wire avoids sorted transparent walls.
const wire=root.listMaterials().find(m=>m.getName().endsWith('_wire'));
const alpha=await sharp(opacity).greyscale().raw().toBuffer();
const rgb=await sharp(wire.getBaseColorTexture().getImage()).removeAlpha().raw().toBuffer();
const rgba=await sharp(rgb,{raw:{width:1024,height:1024,channels:3}}).joinChannel(alpha,{raw:{width:1024,height:1024,channels:1}}).png().toBuffer();
if(!(await sharp(rgba).metadata()).hasAlpha)throw Error('Published wire opacity was lost');
wire.getBaseColorTexture().setImage(rgba).setMimeType('image/png');
wire.setAlphaMode('MASK').setAlphaCutoff(.4);
const color=new Set(root.listMaterials().map(m=>m.getBaseColorTexture()));
for(const texture of root.listTextures()){
 if(texture===wire.getBaseColorTexture())continue;
 texture.setImage(await sharp(texture.getImage()).jpeg({quality:88,chromaSubsampling:color.has(texture)?'4:4:4':'4:2:0'}).toBuffer()).setMimeType('image/jpeg');
}
await MeshoptSimplifier.ready;
await doc.transform(prune(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.35,error:.002}),dedup(),prune());
const bytes=await io.writeBinary(doc),triangles=root.listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+p.getIndices().getCount()/3,0);
const budget=getModelAsset('facility-chainlink-kit').budgets;
if(bytes.length>budget.bytes||triangles>budget.triangles)throw Error(`Fence budget exceeded ${bytes.length}/${triangles}`);
await mkdir(out,{recursive:true});await writeFile(`${out}/chainlink-kit.glb`,bytes);
const provenance={schemaVersion:1,assetId:'facility-chainlink-kit',sourceUrl:receipt.sourceUrl,license:'CC0-1.0',licenseUrl:receipt.licenseUrl,authors:receipt.authors,sourceFiles:receipt.files,opacity:{url:opacityUrl,sha256:hash(opacity)},sha256:hash(bytes),bytes:bytes.length,triangles,bounds:getBounds(scene),modifications:'Extracted authored two-metre panel and post; normalized part pivots; simplified metal hardware; retained 1K PBR maps and authored texture transforms; restored published wire opacity as alpha-tested RGBA. Geometry is placed along mapped fence paths, not used to invent facility perimeters.'};
await writeFile(`${out}/PROVENANCE.json`,JSON.stringify(provenance,null,2)+'\n');await writeFile(`${out}/LICENSE.txt`,'Modular Chainlink Fence by James Ray Cock; fence wire material by Amal Kumar.\nCC0-1.0 https://creativecommons.org/publicdomain/zero/1.0/\nhttps://polyhaven.com/a/modular_chainlink_fence\nExtracted, optimized and repacked for World Explorer. See PROVENANCE.json.\n');
console.log(JSON.stringify({bytes:bytes.length,triangles,bounds:provenance.bounds,sha256:provenance.sha256}));
