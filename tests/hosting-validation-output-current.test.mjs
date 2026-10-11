import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {resolveHostingOutput} from '../scripts/lib/hosting-output.mjs';

test('validation builds cannot overwrite production, saved candidates, arbitrary files or symlink destinations',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'we3d-output-'));
 try{
  assert.equal(await resolveHostingOutput(root,''),path.join(root,'dist'));
  for(const target of ['dist','.local-candidates/test','output/hosting-validation/../safe','/tmp/test','output/hosting-validation/'])await assert.rejects(resolveHostingOutput(root,target,{building:true}));
  const target='output/hosting-validation/review',resolved=await resolveHostingOutput(root,target,{building:true});
  await fs.mkdir(resolved,{recursive:true});await fs.writeFile(path.join(resolved,'save.txt'),'keep');
  await assert.rejects(resolveHostingOutput(root,target,{building:true}));
  assert.equal(await resolveHostingOutput(root,target),resolved);
  assert.equal(await fs.readFile(path.join(resolved,'save.txt'),'utf8'),'keep');
  await fs.symlink(resolved,path.join(root,'output/hosting-validation/link'));
  await assert.rejects(resolveHostingOutput(root,'output/hosting-validation/link'));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
