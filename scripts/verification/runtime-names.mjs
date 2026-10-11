import {mkdtemp,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd();
async function collect(directory){const result=[];for(const item of await readdir(directory,{withFileTypes:true})){const p=path.join(directory,item.name);if(item.isDirectory())result.push(...await collect(p));else if(item.name.endsWith('.js'))result.push(p);}return result;}
const files=[...await collect(path.join(root,'app/js')),...await collect(path.join(root,'js'))].sort();
const temporary=await mkdtemp(path.join(tmpdir(),'we3d-runtime-names-'));
try{
 const control=path.join(temporary,'missing-binding-control.js');
 await writeFile(control,'export function missingBindingControl(){ return __we3dMissingBindingControl; }\n');
 const config=path.join(temporary,'tsconfig.json');
 await writeFile(config,JSON.stringify({compilerOptions:{allowJs:true,checkJs:true,noEmit:true,noResolve:true,skipLibCheck:true,strict:false,target:'ES2022',module:'ESNext',types:[]},files:[...files,path.join(root,'types/browser-runtime-globals.d.ts'),control]}));
 const result=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/lib/tsc.js'),'-p',config,'--pretty','false'],{encoding:'utf8',timeout:90000,maxBuffer:32*1024*1024});
 if(result.error||result.signal||result.stderr)throw result.error||Error(result.stderr||`Compiler stopped: ${result.signal}`);
 const lines=result.stdout.split(/\r?\n/);
 // This is name resolution, not a claim that the legacy application is fully
 // typed. Boundary type checks and module syntax checks remain separate gates.
 const unbound=lines.filter(line=>/error TS(?:2304|2552|18004):/.test(line));
 const controls=unbound.filter(line=>line.includes('missing-binding-control.js')&&line.includes('__we3dMissingBindingControl'));
 if(controls.length!==1)throw Error('Runtime name checker did not reject its missing-binding control.');
 const infrastructure=lines.filter(line=>/^error TS/.test(line));
 if(infrastructure.length)throw Error(infrastructure.join('\n'));
 const failures=unbound.filter(line=>!controls.includes(line));
 for(const failure of failures)console.error(failure);
 console.log(`Checked unresolved names in ${files.length} browser runtime files; ${failures.length} failures. Missing-binding control rejected.`);
 if(failures.length)process.exitCode=1;
}finally{await rm(temporary,{recursive:true,force:true});}
