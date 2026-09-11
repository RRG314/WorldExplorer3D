import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
const directory=new URL('../app/vendor/exifr/',import.meta.url);
await mkdir(directory,{recursive:true});
await build({entryPoints:['node_modules/exifr/dist/full.esm.mjs'],bundle:true,format:'esm',platform:'browser',minify:true,outfile:new URL('exifr.js',directory).pathname});
await copyFile(new URL('../node_modules/exifr/LICENSE',import.meta.url),new URL('LICENSE',directory));
