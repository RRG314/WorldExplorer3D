import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Heap sampling contains call frames, not captured application object strings.
// Reports still discard URL queries and any unexpected executable identity.
const [input,output]=process.argv.slice(2);
assert.ok(input&&output,'Pass allocation sample and summary output paths');
const {profile}=JSON.parse(await readFile(input,'utf8'));
const nodes=[];
const safeName=value=>/^[\w .()$<>-]{0,120}$/.test(value||'')?value||'(anonymous)':'(compiled function)';
function visit(node,parents=[]){
 const frame=node.callFrame||{};let source='native-or-unavailable';
 try{const url=new URL(frame.url);if(url.pathname.startsWith('/app/')||url.pathname.startsWith('/js/'))source=url.pathname;}catch{}
 const name=safeName(frame.functionName);
 const self=Number(node.selfSize)||0;
 const subtree=self+(node.children||[]).reduce((n,child)=>n+visit(child,[name,...parents].slice(0,8)),0);
 nodes.push({name,source,line:frame.lineNumber+1,selfMiB:self/1048576,subtreeMiB:subtree/1048576,callers:parents});
 return subtree;
}
const total=visit(profile.head);
const result={scope:'Instrumented sampled cumulative temporary allocation, including collected objects; not retained heap or FPS acceptance',totalMiB:total/1048576,topSelf:[...nodes].sort((a,b)=>b.selfMiB-a.selfMiB).slice(0,35),topSubtrees:[...nodes].filter(n=>n.source!=='native-or-unavailable').sort((a,b)=>b.subtreeMiB-a.subtreeMiB).slice(0,35)};
await writeFile(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({totalMiB:result.totalMiB,topSelf:result.topSelf.slice(0,12)}));
