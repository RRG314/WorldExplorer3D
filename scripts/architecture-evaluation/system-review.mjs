// Read-only runtime source inventory for the October 4 system review.
// AST counts describe syntax and coupling, not runtime cost or proof of a defect.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const tooling = path.resolve('output/architecture-evaluation/tooling/node_modules');
const {parse} = await import(pathToFileURL(`${tooling}/@babel/parser/lib/index.js`));
const {default: traverse} = await import(pathToFileURL(`${tooling}/@babel/traverse/lib/index.js`));
const files = execFileSync('git', ['ls-files', 'app/js', 'js', 'functions'], {encoding:'utf8'})
  .trim().split('\n').filter(file => /\.(?:m?js|cjs)$/.test(file) && !file.includes('/vendor/'));
const rows=[];
for (const file of files) {
  const source=await fs.readFile(file,'utf8');
  const ast=parse(source,{sourceType:'unambiguous'});
  const ctxBindings=new Set(), access=[], imports=[], signals={}, emptyCatches=[];
  const count=name=>{signals[name]=(signals[name]||0)+1;};
  const key=n=>n.computed ? (n.property.value ?? '[computed]') : n.property.name;
  function contextMember(p) {
    if(!p?.node)return null;
    if(p.isIdentifier())return ctxBindings.has(p.scope.getBinding(p.node.name))?'ctx':null;
    if(p.isMemberExpression()||p.isOptionalMemberExpression()){
      const base=contextMember(p.get('object'));return base?`${base}.${key(p.node)}`:null;
    }
    return null;
  }
  traverse(ast,{ImportDeclaration(p){
    if(p.node.source.value.includes('shared-context'))for(const spec of p.node.specifiers)
      if(spec.imported?.name==='ctx')ctxBindings.add(p.scope.getBinding(spec.local.name));
  }});
  function dependency(spec,kind,line){
    imports.push({spec,kind,line,target:spec.startsWith('.')?path.normalize(path.join(path.dirname(file),spec.split(/[?#]/)[0])):null});
  }
  traverse(ast,{
    ImportDeclaration(p){dependency(p.node.source.value,'static',p.node.loc.start.line);},
    ExportNamedDeclaration(p){if(p.node.source)dependency(p.node.source.value,'static',p.node.loc.start.line);},
    ExportAllDeclaration(p){dependency(p.node.source.value,'static',p.node.loc.start.line);},
    ImportExpression(p){if(p.node.source.type==='StringLiteral')dependency(p.node.source.value,'dynamic',p.node.loc.start.line);},
    CatchClause(p){if(!p.node.body.body.length)emptyCatches.push(p.node.loc.start.line);},
    'MemberExpression|OptionalMemberExpression'(p){
      const member=contextMember(p);if(!member)return;
      const parent=p.parentPath;
      if((parent.isMemberExpression()||parent.isOptionalMemberExpression())&&parent.node.object===p.node)return;
      let kind='read';
      if(parent.isAssignmentExpression()&&parent.node.left===p.node||parent.isUpdateExpression())kind='write';
      else if(parent.isUnaryExpression({operator:'delete'}))kind='delete';
      else if((parent.isCallExpression()||parent.isOptionalCallExpression())&&parent.node.callee===p.node)kind='call';
      access.push({member,kind,line:p.node.loc.start.line});
    },
    'CallExpression|OptionalCallExpression'(p){
      const n=p.node.callee;
      const name=n.type==='Identifier'?n.name:(n.type==='MemberExpression'||n.type==='OptionalMemberExpression')?String(key(n)):'';
      if(['requestAnimationFrame','setInterval','setTimeout','addEventListener','removeEventListener','getBoundingClientRect','getComputedStyle','fixedUpdate','registerRuntimeSystem','createLifecycleScope'].includes(name))count(name);
      if(n.object?.name==='localStorage'||n.object?.name==='sessionStorage')count(`${n.object.name}.${name}`);
      if(n.object?.name==='Object'&&['assign','defineProperty','defineProperties'].includes(name)){
        const root=contextMember(p.get('arguments.0'));
        if(root){const arg=p.node.arguments[1];
          const keys=name==='defineProperty'?[arg?.value??'[computed]']:arg?.type==='ObjectExpression'?arg.properties.map(prop=>prop.computed||prop.type==='SpreadElement'?'[computed]':prop.key.name??prop.key.value):['[computed]'];
          for(const k of keys)access.push({member:`${root}.${k}`,kind:'write',line:p.node.loc.start.line});
        }
      }
      if(name==='require'&&p.node.arguments[0]?.type==='StringLiteral')dependency(p.node.arguments[0].value,'require',p.node.loc.start.line);
    }
  });
  rows.push({file,lines:source.split('\n').length,bytes:Buffer.byteLength(source),sha256:createHash('sha256').update(source).digest('hex'),contextImport:ctxBindings.size>0,imports,access,signals,emptyCatches});
}
const map=new Map(rows.map(r=>[r.file,r]));
for(const r of rows)r.importedBy=rows.filter(other=>other.imports.some(i=>i.target===r.file)).map(other=>other.file);
let sequence=0;const index=new Map(),low=new Map(),stack=[],onStack=new Set(),cycles=[];
function visit(file){index.set(file,sequence);low.set(file,sequence++);stack.push(file);onStack.add(file);
  for(const edge of map.get(file).imports.filter(i=>i.kind!=='dynamic'&&map.has(i.target))){
    const target=edge.target;if(!index.has(target)){visit(target);low.set(file,Math.min(low.get(file),low.get(target)));}
    else if(onStack.has(target))low.set(file,Math.min(low.get(file),index.get(target)));
  }
  if(low.get(file)===index.get(file)){const group=[];let current;do{current=stack.pop();onStack.delete(current);group.push(current);}while(current!==file);if(group.length>1)cycles.push(group.sort());}
}
for(const file of files)if(!index.has(file))visit(file);
const roots=new Map();for(const r of rows)for(const a of r.access){const root=a.member.split('.')[1];if(!roots.has(root))roots.set(root,{root,readers:new Set(),writers:new Set(),calls:0});const v=roots.get(root);v[a.kind==='write'||a.kind==='delete'?'writers':'readers'].add(r.file);if(a.kind==='call')v.calls++;}
const contextRoots=[...roots.values()].map(r=>({...r,readers:[...r.readers],writers:[...r.writers]})).sort((a,b)=>b.writers.length-a.writers.length);
const summary={files:rows.length,lines:rows.reduce((a,r)=>a+r.lines,0),bytes:rows.reduce((a,r)=>a+r.bytes,0),contextModules:rows.filter(r=>r.contextImport).length,contextMembers:contextRoots.length,contextWriterModules:rows.filter(r=>r.access.some(a=>a.kind==='write')).length,staticCycles:cycles.length,
  domains:Object.fromEntries(['app/js','js','functions'].map(prefix=>[prefix,{files:rows.filter(r=>r.file.startsWith(prefix+'/')).length,lines:rows.filter(r=>r.file.startsWith(prefix+'/')).reduce((a,r)=>a+r.lines,0)}])),
  signals:rows.reduce((sum,r)=>{for(const [key,value]of Object.entries(r.signals))sum[key]=(sum[key]||0)+value;return sum;},{}),
  largeFiles:rows.filter(r=>r.lines>1000).length,
  largest:rows.slice().sort((a,b)=>b.lines-a.lines).slice(0,20).map(({file,lines,bytes})=>({file,lines,bytes})),
  widest:rows.slice().sort((a,b)=>b.importedBy.length-a.importedBy.length).slice(0,15).map(r=>({file:r.file,importers:r.importedBy.length})),
  multiwriter:contextRoots.slice(0,18).map(r=>({root:r.root,writers:r.writers.length,readers:r.readers.length}))};
const out='docs/system-review/2026-10-04';await fs.mkdir(out,{recursive:true});
const metadata={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),method:'Fresh Babel AST of tracked runtime JS excluding vendor. Direct binding-aware imported-context accesses and literal dependencies; alias/transitive/reflective writes are not counted. Syntax counts are not performance, defect or coverage metrics.',summary,cycles};
// One record per source file avoids an unwieldy multi-ten-thousand-line diff.
await fs.writeFile(`${out}/inventory.json`,JSON.stringify(metadata,null,2).slice(0,-1)+',\n"contextRoots":[\n'+contextRoots.map(r=>JSON.stringify(r)).join(',\n')+'\n],\n"rows":[\n'+rows.map(r=>JSON.stringify(r)).join(',\n')+'\n]}\n');
console.log(JSON.stringify(summary,null,2));
