import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const folder=new URL('../app/assets/textures/roofs/',import.meta.url);
await fs.mkdir(folder,{recursive:true});
const records=[];
for(const [id,author,width] of [['roof_tiles','Stephan Seeliger',2],['roof_slates_03','Rob Tuytel',3]]){
 const response=await fetch(`https://api.polyhaven.com/files/${id}`);
 if(!response.ok)throw Error(`Metadata HTTP ${response.status}`);
 const source=(await response.json()).Diffuse['1k'].jpg;
 const downloaded=await fetch(source.url);if(!downloaded.ok)throw Error(`Asset HTTP ${downloaded.status}`);
 const input=Buffer.from(await downloaded.arrayBuffer());
 if(createHash('md5').update(input).digest('hex')!==source.md5)throw Error('Source checksum mismatch');
 const output=await sharp(input).webp({quality:90}).toBuffer();
 const name=`${id}-diffuse-1k.webp`;await fs.writeFile(new URL(name,folder),output);
 records.push({id,author,license:'CC0-1.0',page:`https://polyhaven.com/a/${id}`,physicalWidthMeters:width,
  sourceUrl:source.url,sourceMd5:source.md5,file:name,bytes:output.length,sha256:createHash('sha256').update(output).digest('hex')});
}
await fs.writeFile(new URL('PROVENANCE.json',folder),JSON.stringify(records,null,2)+'\n');
console.log(records.map(({id,bytes})=>({id,bytes})));
