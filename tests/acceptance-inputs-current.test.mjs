import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {acceptanceInputs,reusableAcceptance,evidenceReference} from '../scripts/verification/acceptance-inputs.mjs';
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'we3d-acceptance-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'package-lock.json'),'{}');return {root,write:(file,text)=>fs.writeFile(path.join(root,file),text)};}
test('changed transitive runtime and worker inputs invalidate only their owned acceptance case',async t=>{
 const {root,write}=await setup(t);await write('case.mjs',"import './runtime.js?v=2';");await write('runtime.js',"new URL('./worker.js',import.meta.url);");await write('worker.js','export const height=1;');await write('other.mjs','export const value=2;');const definition={entries:['case.mjs']},other={entries:['other.mjs']};const first=await acceptanceInputs(root,definition),unrelated=await acceptanceInputs(root,other);await write('worker.js','export const height=4;');assert.notEqual((await acceptanceInputs(root,definition)).fingerprint,first.fingerprint);assert.equal((await acceptanceInputs(root,other)).fingerprint,unrelated.fingerprint);
});
test('documentation and other case definitions do not invalidate an unchanged runtime receipt',async t=>{
 const {root,write}=await setup(t);await write('case.mjs','export const value=2;');await write('receipt.log','passed');const definition={entries:['case.mjs'],args:['--test','case.mjs']},identity=await acceptanceInputs(root,definition),receipt={status:'passed',fingerprint:identity.fingerprint,evidence:[await evidenceReference(root,'receipt.log')]};await write('notes.md','A new planning note.');assert.equal(await reusableAcceptance(root,receipt,await acceptanceInputs(root,definition)),true);assert.notEqual((await acceptanceInputs(root,{...definition,args:['case.mjs']})).fingerprint,identity.fingerprint);
});
test('failed receipts and changed or missing evidence are never reused',async t=>{
 const {root,write}=await setup(t);await write('case.mjs','export const value=2;');await write('receipt.log','passed');const identity=await acceptanceInputs(root,{entries:['case.mjs']}),receipt={status:'passed',fingerprint:identity.fingerprint,evidence:[await evidenceReference(root,'receipt.log')]};assert.equal(await reusableAcceptance(root,{...receipt,status:'failed'},identity),false);await write('receipt.log','changed');assert.equal(await reusableAcceptance(root,receipt,identity),false);await fs.unlink(path.join(root,'receipt.log'));assert.equal(await reusableAcceptance(root,receipt,identity),false);
});
test('HTML module paths are bound and missing local modules fail instead of silently reusing evidence',async t=>{
 const {root,write}=await setup(t);await write('fixture.html','<script type="module">import "./runtime.js?v=3";</script>');await write('runtime.js','export const value=2;');const first=await acceptanceInputs(root,{entries:['fixture.html']});assert.ok(first.inputs['runtime.js']);await fs.unlink(path.join(root,'runtime.js'));await assert.rejects(acceptanceInputs(root,{entries:['fixture.html']}),/ENOENT/);
});

test('the acceptance CLI binds declared result evidence and refuses a success with a missing result',async t=>{
 const {root,write}=await setup(t);await fs.mkdir(path.join(root,'config'));
 await write('case.mjs',"import fs from 'node:fs';fs.appendFileSync('calls.txt','x');fs.writeFileSync('result.json',JSON.stringify({passed:true}));");
 const definition={id:'fixture',entries:['case.mjs'],args:['case.mjs'],evidence:['result.json'],timeoutMs:10000};
 const manifest=()=>write('config/browser-foundation-acceptance.json',JSON.stringify({cases:[definition]}));await manifest();
 const cli=fileURLToPath(new URL('../scripts/verification/browser-foundation-acceptance.mjs',import.meta.url));
 const run=()=>JSON.parse(execFileSync(process.execPath,[cli],{cwd:root,encoding:'utf8'}));
 assert.equal(run().cases[0].status,'passed');assert.equal(run().cases[0].status,'reused');
 await write('result.json','tampered');assert.equal(run().cases[0].status,'passed');assert.equal(await fs.readFile(path.join(root,'calls.txt'),'utf8'),'xx');
 definition.evidence.push('missing.json');await manifest();assert.throws(run);
 const receipt=JSON.parse(await fs.readFile(path.join(root,'output/research/browser-completion-2026-10-20/acceptance/fixture.json'),'utf8'));
 assert.equal(receipt.status,'failed');assert.match(receipt.evidenceError,/missing.json/);
});
