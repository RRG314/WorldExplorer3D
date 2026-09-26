import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDecalTriangle} from '../app/js/terrain/surface-decal-projection.js';
for(const [city,expected] of [['monaco','c430fe12fa26aa35196090c3debff05bee69bb4f0db1c7d672ee8af13c3da2c4'],['sf','2799dec46b2a78b3e5a951b7f8c4de91e85ea52a70a6dc5a6e6839915d46a0af']])test(`${city}: broad-phase projection preserves pre-optimization output`,()=>{
 const capture=JSON.parse(readFileSync(new URL(`../docs/streets/audit-2026-09-13/${city}-unioned-roads-surfaces.json`,import.meta.url)));
 const triangles=capture.surfaces.filter(s=>s.family==='road').flatMap(s=>s.triangles);
 const positions=Float32Array.from(triangles.flatMap(t=>t.flatMap(p=>[p.x,p.y,p.z]))),supports=[];
 for(let a=0;a<positions.length;a+=9){const b=a+3,c=a+6,p=positions;supports.push({positions:p,a,b,c,denominator:(p[b+2]-p[c+2])*(p[a]-p[c])+(p[c]-p[b])*(p[a+2]-p[c+2])});}
 const results=[];
 for(let i=0;i<triangles.length;i+=37)results.push(projectDecalTriangle(triangles[i],supports,.012));
 assert.equal(createHash('sha256').update(JSON.stringify(results)).digest('hex'),expected);
});
