import {SourceTextModule, Script} from 'node:vm';
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Parse without linking or executing browser modules. This catches syntax
// errors in lazy runtime entrypoints that component imports never evaluate.
const root=fileURLToPath(new URL('../../',import.meta.url));
const roots=['app/js', 'js', 'functions', 'scripts'];
async function* modules(directory){
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const target=path.join(directory,entry.name);
    if(entry.isDirectory() && !['node_modules', '.git'].includes(entry.name))yield* modules(target);
    else if(/\.[cm]?js$/.test(entry.name))yield target;
  }
}
let rejectsInvalid=false;
try {new SourceTextModule('function sync(){ await work(); }');} catch(error){rejectsInvalid=error instanceof SyntaxError;}
if(!rejectsInvalid)throw new Error('Syntax gate failed its invalid-await control');
let count=0,failed=0;
for (const directory of roots) for await(const file of modules(path.join(root,directory))){
  try {
    const code=await readFile(file,'utf8');
    if(file.endsWith('.cjs') || (directory==='functions' && !file.endsWith('.mjs'))) new Script(code,{filename:file});
    else new SourceTextModule(code,{identifier:file});
    count++;
  }
  catch(error){failed++;console.error(`${path.relative(root,file)}: ${error.message}`);}
}
console.log(`Parsed ${count} runtime and release-tooling JavaScript files; ${failed} syntax failures.`);
if(failed)process.exitCode=1;
