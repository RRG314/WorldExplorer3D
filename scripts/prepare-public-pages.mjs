import fs from 'node:fs/promises';
import path from 'node:path';
if (!process.argv.includes('--check')) process.argv.push('--check');
await import('./sync-public-gallery.mjs');

const destination=path.resolve(process.argv.find(arg=>arg.startsWith('--out='))?.slice(6)||'_site');
const gallery=JSON.parse(await fs.readFile('config/public-gallery.json','utf8'));
await fs.mkdir(destination,{recursive:true});
for (const file of ['index.html','styles.css','favicon.svg']) {
  await fs.copyFile(`github-pages/${file}`,path.join(destination,file));
}
for (const image of gallery.images) {
  const target=path.join(destination,image.file);
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.copyFile(image.file,target);
}
console.log(`Prepared public Pages with ${gallery.images.length} gallery images.`);
