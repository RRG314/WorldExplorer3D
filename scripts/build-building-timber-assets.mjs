import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const folder=new URL('../app/assets/textures/facades/',import.meta.url);
const records=[];
for(const [id,authors,width,rotation] of [
  ['white_planks_clean',['Rob Tuytel'],1.8,90],
  ['japanese_cedar_planks',['Charlotte Baglioni','Rico Cilliers'],1.13,0]
]) {
  const response=await fetch(`https://api.polyhaven.com/files/${id}`);
  if(!response.ok)throw Error(`Metadata HTTP ${response.status}`);
  const source=(await response.json()).Diffuse['1k'].jpg;
  const downloaded=await fetch(source.url);
  if(!downloaded.ok)throw Error(`Asset HTTP ${downloaded.status}`);
  const input=Buffer.from(await downloaded.arrayBuffer());
  if(createHash('md5').update(input).digest('hex')!==source.md5)throw Error('Source checksum mismatch');
  const output=await sharp(input).rotate(rotation).webp({quality:90}).toBuffer();
  const file=`${id}-diffuse-1k.webp`;
  await fs.writeFile(new URL(file,folder),output);
  records.push({id,authors,license:'CC0-1.0',page:`https://polyhaven.com/a/${id}`,physicalWidthMeters:width,
    rotationDegrees:rotation,sourceUrl:source.url,sourceMd5:source.md5,file,bytes:output.length,
    sha256:createHash('sha256').update(output).digest('hex')});
}
await fs.writeFile(new URL('TIMBER_PROVENANCE.json',folder),JSON.stringify(records,null,2)+'\n');
console.log(records.map(({id,bytes})=>({id,bytes})));
