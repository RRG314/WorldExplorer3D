import {build} from 'esbuild';
await build({entryPoints:['app/js/transport/vehicle-garage-rules.js'],outfile:'functions/generated/vehicle-garage-rules.cjs',bundle:true,format:'cjs',platform:'node',target:'node22',legalComments:'none'});
