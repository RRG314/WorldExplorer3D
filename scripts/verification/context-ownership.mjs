import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const parser=['node_modules/@babel/parser/lib/index.js','output/architecture-evaluation/tooling/node_modules/@babel/parser/lib/index.js'].find(existsSync);
if(!parser)throw Error('Install the pinned @babel/parser development dependency before checking ownership.');
const {parse}=await import(pathToFileURL(path.resolve(parser)));

// Conservative syntax guard, not a claim to detect arbitrary reflection. Include
// injected context parameters and local aliases as well as imported context.
export function contextWrites(source) {
 const tree=parse(source,{sourceType:'unambiguous'});
 const roots=new Map([['ctx',''],['appCtx','']]),writes=new Set();
 function member(node){
  if(!node)return null;
  if(node.type==='Identifier')return roots.has(node.name)?roots.get(node.name):null;
  if(['MemberExpression','OptionalMemberExpression'].includes(node.type)){
   const base=member(node.object);if(base===null)return null;
   const key=node.computed?(node.property.value??'*'):node.property.name;
   return base?`${base}.${key}`:key;
  }
  return null;
 }
 function visit(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='ImportDeclaration'&&node.source.value.includes('shared-context')){
   for(const spec of node.specifiers)if(spec.imported?.name==='ctx')roots.set(spec.local.name,'');
  }
  if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'){const base=member(node.init);if(base!==null)roots.set(node.id.name,base);}
  if(node.type==='AssignmentExpression'){const key=member(node.left);if(key)writes.add(key.split('.')[0]);}
  if(node.type==='UpdateExpression'||node.type==='UnaryExpression'&&node.operator==='delete'){const key=member(node.argument);if(key)writes.add(key.split('.')[0]);}
  if(node.type==='CallExpression'&&node.callee?.object?.name==='Object'){
   const method=node.callee.property?.name,base=member(node.arguments[0]);
   if(base!==null&&['assign','defineProperty','defineProperties'].includes(method)){
    if(base)writes.add(base.split('.')[0]);
    else if(method==='defineProperty')writes.add(node.arguments[1]?.value||'*');
    else for(const object of node.arguments.slice(1)){
     if(object.type!=='ObjectExpression'){writes.add('*');continue;}
     for(const prop of object.properties)writes.add(prop.key?.name||prop.key?.value||'*');
    }
   }
  }
  for(const [key,value] of Object.entries(node)){if(['loc','start','end','extra','comments','tokens'].includes(key))continue;if(Array.isArray(value))value.forEach(visit);else if(value?.type)visit(value);}
 }
 visit(tree);return [...writes].sort();
}
export async function checkContextOwnership({writeBaseline=false}={}) {
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','app/js','js'],{encoding:'utf8'}).trim().split('\n').filter(f=>/\.js$/.test(f)&&!f.includes('/vendor/'));
 const current={};for(const file of files){const writes=contextWrites(await fs.readFile(file,'utf8'));if(writes.length)current[file]=writes;}
 const file='config/context-write-allowlist.json';
 if(writeBaseline){await fs.writeFile(file,JSON.stringify({schemaVersion:1,scope:'Existing root context writers; additions require review. Aliases are conservatively tracked; reflective accesses are not certified.',writers:current},null,2)+'\n');return;}
 const allowed=JSON.parse(await fs.readFile(file,'utf8')).writers,failures=[];
 for(const [file,keys] of Object.entries(current))for(const key of keys)if(!allowed[file]?.includes(key))failures.push(`${file}: ${key}`);
 if(failures.length)throw Error(`Unreviewed state ownership writes:\n${failures.join('\n')}`);
 console.log(JSON.stringify({ok:true,guard:'context-write-ownership',writerFiles:Object.keys(current).length}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await checkContextOwnership({writeBaseline:process.argv.includes('--write-reviewed-baseline')});
