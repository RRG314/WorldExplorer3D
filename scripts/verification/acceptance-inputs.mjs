import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parse} from '@babel/parser';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const literal=node=>node?.type==='StringLiteral'?node.value:node?.type==='Literal'&&typeof node.value==='string'?node.value:null;
function references(source){
 const output=[];
 const add=(value,commonJS=false,directoryUrl=false)=>output.push({value,commonJS,directoryUrl});
 const ast=parse(source,{sourceType:'unambiguous',allowAwaitOutsideFunction:true,plugins:['importAttributes']});
 const visit=node=>{
  if(!node||typeof node!=='object')return;
  if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)&&literal(node.source))add(literal(node.source));
  if(node.type==='ImportExpression'&&literal(node.source))add(literal(node.source));
  if(node.type==='CallExpression'&&node.callee?.type==='Import'&&literal(node.arguments?.[0]))add(literal(node.arguments[0]));
  if(node.type==='CallExpression'&&node.callee?.name==='require'&&literal(node.arguments?.[0]))add(literal(node.arguments[0]),true);
  if(node.type==='NewExpression'&&node.callee?.name==='URL'&&literal(node.arguments?.[0]))add(literal(node.arguments[0]),false,true);
  for(const [key,value]of Object.entries(node))if(!['loc','start','end','extra','comments','tokens'].includes(key)){
   if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
  }
 };
 visit(ast);return output;
}
export async function acceptanceInputs(root,definition,{artifactRoot=null}={}){
 const files=new Map(),visited=new Set();
 const add=async(relative,follow=false)=>{
  const normalized=relative.split(path.sep).join('/');if(visited.has(normalized))return;visited.add(normalized);
  const absolute=path.resolve(root,relative);if(!absolute.startsWith(path.resolve(root)+path.sep))throw Error('Acceptance input leaves workspace');
  const stat=await fs.stat(absolute);
  if(stat.isDirectory()){for(const entry of (await fs.readdir(absolute)).sort())await add(path.join(relative,entry),follow);return;}
  const bytes=await fs.readFile(absolute);files.set(normalized,digest(bytes));if(!follow)return;
  let refs=[];
  if(/\.(?:m?js|cjs)$/.test(relative))refs=references(bytes.toString());
  if(/\.html$/.test(relative)){
   // Extract repository module inputs, including valid whitespace before an
   // end tag's closing bracket. This is dependency discovery, not sanitization.
   const text=bytes.toString();for(const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
    const src=match[1].match(/\bsrc=["']([^"']+)["']/i);if(src)refs.push({value:src[1],commonJS:false});else if(/\btype=["']module["']/i.test(match[1]))refs.push(...references(match[2]));
   }
  }
  for(const {value:ref,commonJS,directoryUrl} of refs){
   if(!ref.startsWith('.')&&!ref.startsWith('/'))continue;
   let target=ref.startsWith('/')?ref.slice(1).split(/[?#]/)[0]:path.join(path.dirname(relative),ref.split(/[?#]/)[0]);
   // Missing local module inputs are a real acceptance failure. Nonmodule URL
   // assets can be served externally; explicit asset coverage belongs to package integrity.
   try{await fs.stat(path.resolve(root,target));}catch(error){
    if(commonJS){
     let resolved=null;
     for(const candidate of [target+'.js',target+'.json',path.join(target,'index.js')])if(await fs.stat(path.resolve(root,candidate)).catch(()=>null)){resolved=candidate;break;}
     if(!resolved)throw error;target=resolved;
   }else{if(/\.(?:m?js|cjs|json)$/.test(target))throw error;continue;}
   }
   // new URL('../', import.meta.url) is often a filesystem base, not an
   // instruction to scan the entire repository and its private/generated files.
   // Asset directories must be explicitly declared in the case's files list.
   if(directoryUrl&&(await fs.stat(path.resolve(root,target))).isDirectory())continue;
   await add(target,true);
  }
 };
 for(const entry of definition.entries||[])await add(entry,true);
 for(const entry of definition.files||[])await add(entry,false);
 await add('package-lock.json',false);
 if(definition.artifact){if(!artifactRoot)throw Error('An isolated candidate is required');await add(artifactRoot,false);}
 const inputs=Object.fromEntries([...files].sort(([a],[b])=>a.localeCompare(b)));
 return {fingerprint:digest(JSON.stringify({definition,inputs})),inputs};
}
export async function reusableAcceptance(root,receipt,identity){
 if(receipt?.status!=='passed'||receipt.fingerprint!==identity.fingerprint||!receipt.evidence?.length)return false;
 for(const item of receipt.evidence){try{if(digest(await fs.readFile(path.resolve(root,item.path)))!==item.sha256)return false;}catch{return false;}}
 return true;
}
export async function evidenceReference(root,relative){return {path:relative,sha256:digest(await fs.readFile(path.resolve(root,relative)))};}
