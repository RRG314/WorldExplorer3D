import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import {acceptanceInputs} from '../acceptance-inputs.mjs';
import {commonGameplayInputs} from './common-inputs.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
export function checkImplementation(source,id){
 const tree=parse(source,{sourceType:'module',plugins:['importAttributes']}),checks=[];
 const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&node.callee?.name==='check'&&node.arguments[0]?.type==='StringLiteral')checks.push(node);for(const [key,value]of Object.entries(node))if(!['loc','start','end','extra','comments'].includes(key)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}};visit(tree);
 const target=checks.filter(c=>c.arguments[0].value===id);if(target.length!==1)throw Error('Expected one implementation for '+id);
 // Shared setup and the selected assertion body are the test inputs. Editing
 // a later unrelated check does not invalidate every completed city action.
 return sha(source.slice(0,Math.min(...checks.map(c=>c.start)))+'\n'+source.slice(target[0].start,target[0].end));
}
export async function gameplayQaInputs(root,group,id,{implementationSource,sharedCache}={}){
 if(group.kind!=='browser')return acceptanceInputs(root,{id:group.id,entries:group.kind==='unit'?group.tests:[group.module],files:group.files||[]});
 const source=implementationSource??await fs.readFile(path.join(root,group.module),'utf8'),tree=parse(source,{sourceType:'module'});
 const entries=tree.program.body.filter(n=>n.type==='ImportDeclaration'&&n.source.value.startsWith('.')).map(n=>path.join(path.dirname(group.module),n.source.value));
 const common=await commonGameplayInputs(root),files=[...common,...(group.files||[]),...(group.checkFiles?.[id]||[])],key=JSON.stringify({id:group.id,entries,files});
 let shared=sharedCache?.get(key);if(!shared){shared=await acceptanceInputs(root,{id:group.id,entries,files});sharedCache?.set(key,shared);}
 const implementation=checkImplementation(source,id),inputs={...shared.inputs,[group.module+'#'+id]:implementation};
 return {fingerprint:sha(JSON.stringify({id,inputs})),inputs,implementationScope:'shared setup plus this check body; direct imported helpers and declared product inputs',implementation};
}
