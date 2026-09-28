import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const candidates=['node_modules/typescript/lib/tsc.js','output/architecture-evaluation/tooling/node_modules/typescript/lib/tsc.js'];
const compiler=candidates.find(path=>existsSync(path));
if(!compiler)throw Error('Boundary type checker is not installed. Use the pinned isolated tooling instructions in docs/architecture-evaluation/REPRODUCING_EXPERIMENTS.md.');
const result=spawnSync(process.execPath,[compiler,'-p','tsconfig.boundaries.json'],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
