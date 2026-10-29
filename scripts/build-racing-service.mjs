import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const check=process.argv.includes('--check');
const result=await build({absWorkingDir:root,entryPoints:['services/racing/engine-entry.mjs'],outfile:'services/racing/generated/engine.mjs',write:!check,
 bundle:true,platform:'node',format:'esm',target:'node22',sourcemap:false,legalComments:'none',
 banner:{js:'// Generated from existing browser rules by scripts/build-racing-service.mjs. Do not edit.'}});
if(check&&(await fs.readFile(path.join(root,'services/racing/generated/engine.mjs'),'utf8'))!==result.outputFiles[0].text)throw Error('Rebuild the race service after changing shared rules.');
