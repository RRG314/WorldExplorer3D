import {build} from 'esbuild';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
export function buildSharedPortal({write=true}={}){
  return build({absWorkingDir:root,stdin:{contents:"export * from './app/js/portal/trail-model.js'; export * from './app/js/portal/catalog.js'; export * from './app/js/portal/game-intent.js';",resolveDir:root},
    outfile:path.join(root,'functions/generated/portal.cjs'),bundle:true,platform:'node',format:'cjs',target:'node22',write,legalComments:'none',
    banner:{js:"'use strict';\n// Generated from app/js/portal. Run node scripts/build-shared-portal.mjs after changing the shared model/catalog."}});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await buildSharedPortal();
