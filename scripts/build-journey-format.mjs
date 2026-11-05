import {build} from 'esbuild';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function buildJourneyFormat({write=true}={}) {
  return build({absWorkingDir:root,entryPoints:['app/js/player/journey-format.js'],
    outfile:'functions/generated/journey-format.cjs',bundle:true,platform:'node',format:'cjs',target:'node20',write,
    legalComments:'none',banner:{js:"'use strict';\n// Generated from the browser journey format. Run npm run build:journey-format."}});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await buildJourneyFormat();
