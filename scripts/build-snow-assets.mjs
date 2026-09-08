import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=new URL('../app/assets/textures/earth/',import.meta.url);
const metadata=await (await fetch('https://api.polyhaven.com/files/snow_02')).json();
const files=[];
for(const [key,suffix] of [['Diffuse','diffuse'],['nor_gl','normal'],['Rough','roughness']]) {
  const source=metadata[key]['1k'].jpg;
  const response=await fetch(source.url);
  if(!response.ok)throw Error(`Snow asset HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(createHash('md5').update(bytes).digest('hex')!==source.md5)throw Error('Source checksum mismatch');
  const output=await sharp(bytes).resize(512,512).jpeg({quality:88}).toBuffer();
  const name=`snow_02_${suffix}.jpg`;
  await fs.writeFile(new URL(name,root),output);
  files.push({name,source:source.url,sourceMd5:source.md5,bytes:output.length,sha256:createHash('sha256').update(output).digest('hex')});
}
await fs.writeFile(new URL('snow_02.provenance.json',root),JSON.stringify({asset:'snow_02',author:'Rob Tuytel',license:'CC0',page:'https://polyhaven.com/a/snow_02',physicalWidthMeters:2,files},null,2)+'\n');
console.log(files);
