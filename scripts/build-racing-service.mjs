import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const check=process.argv.includes('--check');
for(const [outfile,format]of [['services/racing/generated/engine.mjs','esm'],['functions/generated/racing-engine.cjs','cjs']]){
const result=await build({absWorkingDir:root,entryPoints:['services/racing/engine-entry.mjs'],outfile,write:!check,
 bundle:true,platform:'node',format,target:'node22',sourcemap:false,legalComments:'none',
 banner:{js:'// Generated from existing browser rules by scripts/build-racing-service.mjs. Do not edit.'}});
if(check&&(await fs.readFile(path.join(root,outfile),'utf8'))!==result.outputFiles[0].text)throw Error('Rebuild the race service after changing shared rules.');
}
