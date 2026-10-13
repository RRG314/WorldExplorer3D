// Qualify the owner's existing scientific implementation in place. No source,
// dataset or vendor copy is made and no World Explorer feature is enabled here.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Pass the existing Collision Lab checkout explicitly.');
const out=process.env.WE3D_COLLISION_AUDIT_OUTPUT||'output/verification/collision-lab-reuse';
await mkdir(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=name=>readFile(join(root,name));
const load=name=>import(pathToFileURL(join(root,'src',name)).href);
const report={ok:false,scope:'Direct existing-source numerical and asset-integrity qualification; not traversal, art quality, browser performance or World Explorer integration',checks:[],sources:[],assets:[]};
const check=(name,fn)=>{fn();report.checks.push(name);};
const near=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
try {
 const pkg=JSON.parse(await read('package.json'));
 assert.equal(pkg.name,'collision-lab');
 report.source={name:pkg.name,version:pkg.version,license:pkg.license,three:pkg.dependencies.three};
 for(const name of ['models.mjs','science.mjs','receipt.mjs','export.mjs','missions.mjs','data-integrity.mjs','facility.mjs']) {
  const bytes=await read(`src/${name}`);report.sources.push({file:`src/${name}`,bytes:bytes.length,sha256:hash(bytes)});
 }
 const models=await load('models.mjs'),science=await load('science.mjs');
 const {verifyReceipt}=await load('receipt.mjs'),{missions}=await load('missions.mjs');
 check('seven authored missions retain goals, methods, limits and sources',()=>{
  assert.deepEqual(missions.map(m=>m.id),['bend','rf','focus','signals','track','mass','evidence']);
  for(const m of missions){assert.ok(m.cases>0&&m.intro&&m.model&&m.source);for(let c=0;c<m.cases;c++)assert.ok(m.goal(c));}
 });
 check('beam curvature preserves units, polarity and zero-field straight flight',()=>{
  const a=models.bend(.299792458,1),b=models.bend(.299792458,-1),straight=models.bend(1,0);
  near(a.radius,1);near(b.radius,1);near(a.points[25][0],b.points[25][0]);near(a.points[25][1],-b.points[25][1]);
  assert.deepEqual(straight.points.at(-1),[6,0]);assert.throws(()=>models.bend(0,1));
 });
 check('RF crest, quadrature and braking phases produce the expected energy',()=>{
  near(models.accelerate(0).energy,36);near(models.accelerate(90).energy,20);near(models.accelerate(180).energy,4);
 });
 check('both authored focusing targets are reachable with finite retained paths',()=>{
  const solutions=[];
  for(const spread of [1,1.25]) {
   let found;
   for(let a=1;a<=30&&!found;a++)for(let b=1;b<=30&&!found;b++) {
    const r=models.beamTransport(a/20,b/20,true,spread);
    if(r.lost===0&&r.x<=(spread===1?.0025:.0032)&&r.y<=(spread===1?.0025:.001))found={k1:a/20,k2:b/20,x:r.x,y:r.y};
   }
   assert.ok(found,'Unreachable focusing case');solutions.push(found);
  }
  report.focusingSolutions=solutions;
 });
 check('detector identification needs distinguishing readouts',()=>{
  for(let i=0;i<models.signatures.length;i++)assert.deepEqual(models.candidates(models.signatures[i].signal,[0,1,2,3]),[i]);
  assert.deepEqual(models.candidates(models.signatures[0].signal,[1]),[0,1]);
 });
 check('track fit separates the authored signal from unrelated hits',()=>{
  for(const [c,ids,k] of [[0,'BHFADJ',.16],[1,'GACJEF',-.13]]) {
   const hits=models.hitSample(c),fit=models.fitTrack(hits.filter(h=>ids.includes(h.id)));
   assert.equal(fit.count,6);assert.ok(fit.residual<.015);near(fit.k,k,.02);
   assert.ok(models.fitTrack(hits).residual>fit.residual);
  }
 });
 check('Lorentz boost reaches rest while preserving invariant mass',()=>{
  const pair=[{E:5,px:4,py:0,pz:0},{E:5,px:2,py:0,pz:0}],r=models.boostPair(pair,.6);
  near(r.energy,8);near(r.momentum,0);near(r.mass,8);near(science.invariantMass(...pair),8);
  assert.throws(()=>models.boostPair(pair,1));assert.throws(()=>science.invariantMass({E:1,px:9,py:0,pz:0},pair[1]));
 });
 const bytes=await read('public/data/events.json'),{bundleHash}=await load('data-integrity.mjs');
 assert.equal(hash(bytes),bundleHash);const bundle=science.validateBundle(JSON.parse(bytes)),summary=science.prepareSummary(bundle);
 report.dataset={rows:bundle.count,bytes:bytes.length,sha256:bundleHash,category:bundle.category};
 check('all 100,000 recorded rows validate and charge controls partition the selected sample',()=>{
  assert.equal(bundle.count,100000);
  const all=science.select(summary,20,'all'),opposite=science.select(summary,20,'opposite'),same=science.select(summary,20,'same');
  assert.equal(opposite.indices.length+same.indices.length,all.indices.length);
  assert.equal(new Set([...opposite.indices,...same.indices]).size,all.indices.length);
  report.selected={all:all.indices.length,opposite:opposite.indices.length,same:same.indices.length};
 });
 check('evidence receipts reproduce and reject changed counts or source identity',()=>{
  const selected=science.select(summary,20,'opposite'),receipt=science.receipt(bundle,selected,20,'opposite');
  assert.deepEqual(verifyReceipt(receipt,bundle,summary),selected);
  assert.throws(()=>verifyReceipt({...receipt,count:receipt.count+1},bundle,summary));
  assert.throws(()=>verifyReceipt({...receipt,sourceSha256:'0'.repeat(64)},bundle,summary));
 });
 const manifest=JSON.parse(await read('public/geometry/manifest.json'));
 assert.equal(manifest.license,'MIT');assert.ok((await read(join('public',manifest.licenseFile))).length>100);
 for(const asset of manifest.assets) {
  const file=resolve(root,'public',asset.file);assert.ok(!relative(join(root,'public'),file).startsWith(`..${sep}`));
  const content=await readFile(file);assert.equal(content.length,asset.bytes);assert.equal(hash(content),asset.sha256);assert.equal(content.toString('ascii',0,4),'glTF');
  report.assets.push({id:asset.id,bytes:content.length,sha256:asset.sha256});
 }
 report.checks.push('18 existing detector components retain verified bytes and license');assert.equal(report.assets.length,18);
 report.geometryLimits=manifest.limits;report.ok=true;
} catch(error) {report.error=String(error.stack||error);process.exitCode=1;}
finally {await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({ok:report.ok,checks:report.checks,source:report.source,dataset:report.dataset,selected:report.selected,assets:report.assets.length,error:report.error}));
