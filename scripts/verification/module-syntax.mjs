import {SourceTextModule} from 'node:vm';
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Parse without linking or executing browser modules. This catches syntax
// errors in lazy runtime entrypoints that component imports never evaluate.
const root=fileURLToPath(new URL('../../app/js/',import.meta.url));
async function* modules(directory){
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const target=path.join(directory,entry.name);
    if(entry.isDirectory())yield* modules(target);
    else if(/\.m?js$/.test(entry.name))yield target;
  }
}
let rejectsInvalid=false;
try {new SourceTextModule('function sync(){ await work(); }');} catch(error){rejectsInvalid=error instanceof SyntaxError;}
if(!rejectsInvalid)throw new Error('Syntax gate failed its invalid-await control');
let count=0,failed=0;
for await(const file of modules(root)){
  try {new SourceTextModule(await readFile(file,'utf8'),{identifier:file});count++;}
  catch(error){failed++;console.error(`${path.relative(root,file)}: ${error.message}`);}
}
console.log(`Parsed ${count} production JavaScript modules; ${failed} syntax failures.`);
if(failed)process.exitCode=1;
