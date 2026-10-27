import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {runtimeGeneration, generationModulePath, pinHtmlRootModules, snapshotRootModules, retainRuntimeGenerations, verifyRuntimeGenerations} from '../scripts/lib/hosting-runtime-generation.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'we3d-runtime-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  const put = async (file, contents) => { await fs.mkdir(path.dirname(path.join(root, file)), {recursive:true}); await fs.writeFile(path.join(root, file), contents); };
  return {root, put};
}
async function predecessor(t, {number='1', environment='staging', legacy=false, configuration=null}={}) {
  const f = await fixture(t), generation = runtimeGeneration(number.repeat(64), environment);
  const paths = ['js/shared.js', 'app/js/shared-context.js'];
  await f.put(paths[0], `export const generation = '${number}';`);
  await f.put(paths[1], 'export const ctx = {};');
  if(configuration!==null){paths.push('js/firebase-project-config.js');await f.put(paths[2],configuration);}
  const entry = `app/js/bundles/app-${number}.js`;
  await f.put(entry, `export const number = '${number}';`);
  const snapshot = legacy ? null : await snapshotRootModules(f.root, paths, generation, 'unused');
  const files = {[entry]:hash(await fs.readFile(path.join(f.root, entry)))};
  for (const file of paths) files[file] = hash(await fs.readFile(path.join(f.root, file)));
  if (snapshot) Object.assign(files, snapshot.files);
  const assets = {schemaVersion:1, files}, contentHash = hash(json(files));
  const build = {version:'1.0', commit:number.repeat(40), contentHash, sourceDirty:false, firebaseEnvironment:environment, firebaseProjectId:`fixture-${environment}`,
    buildId:`1.0+${number.repeat(12)}.${contentHash.slice(0,16)}.${environment}`, assetManifestSha256:hash(json(assets)), fileCount:Object.keys(files).length,
    runtimePackaging:{entries:{'app-entry':entry.slice(4)}, generation:snapshot, bundlePaths:[entry], fileCount:1}};
  await f.put('asset-manifest.json', json(assets)); await f.put('build-manifest.json', json(build));
  return {...f, assets, build, generation};
}
const retain = (output, predecessors) => retainRuntimeGenerations({output, predecessors, environment:'staging', projectId:'fixture-staging'});

test('shared modules and HTML use one generation without changing app links, assets or external SDK URLs', () => {
  const g = runtimeGeneration('a'.repeat(64), 'staging');
  assert.deepEqual(g, runtimeGeneration('a'.repeat(64), 'production'), 'Promotion keeps code URLs identical across isolated origins');
  assert.equal(generationModulePath(g, '/js/auth.js?v=3'), `${g.prefix}/js/auth.js?v=3`);
  assert.throws(() => generationModulePath(g, '/js/../private.js'));
  const html = `<script src="../js/config.js"></script><script type="module">import '../js/auth.js?v=3'; import 'https://sdk.invalid/js/auth.js';</script><a href="/app/">Play</a><img src="../assets/photo.jpg">`;
  const result = pinHtmlRootModules(html, 'account/index.html', g, new Set(['js/config.js','js/auth.js']));
  assert.ok(result.includes(`src="${g.prefix}/js/config.js"`));
  assert.ok(result.includes(`import '${g.prefix}/js/auth.js?v=3'`));
  assert.ok(result.includes('href="/app/"')); assert.ok(result.includes('https://sdk.invalid/js/auth.js')); assert.ok(result.includes('../assets/photo.jpg'));
});

test('other packaged pages expose their immutable module prefix without creating another app context', () => {
  const g=runtimeGeneration('a'.repeat(64),'staging');
  const html=pinHtmlRootModules('<!doctype html><html lang="en"><head><script src="../js/config.js"></script></head></html>','portal/index.html',g,new Set(['js/config.js']));
  assert.ok(html.includes(`<html lang="en" data-runtime-module-prefix="${g.prefix}">`));
  assert.ok(html.includes(`src="${g.prefix}/js/config.js"`));
  assert.ok(!html.includes('__WORLD_EXPLORER_PRODUCTION__'),'Metadata does not install a new runtime or state owner');
});

test('Portal offline static policy admits pinned public code and excludes account, API, private and foreign resources', async () => {
  const source=await fs.readFile(new URL('../portal/sw.js',import.meta.url),'utf8');
  const start=source.indexOf('function staticUrl('),end=source.indexOf('\nasync function remember',start);
  const staticUrl=vm.runInNewContext(`${source.slice(start,end)};staticUrl`,{URL,self:{location:new URL('https://fixture.invalid/portal/sw.js')}});
  const prefix='/runtime/'+'a'.repeat(24);
  for(const file of [`${prefix}/js/firebase-init.js?v=58`,`${prefix}/app/js/shared-context.js?v=55`,'/app/js/bundles/chunk-ABC123.js','/portal/'])assert.ok(staticUrl(file),file);
  for(const file of ['/account/','/api/private','/registerAppTester',`${prefix}/js/user.json`,`${prefix}/account/profile.js`,'/runtime/unknown/js/auth.js','https://other.invalid/js/auth.js'])assert.equal(staticUrl(file),null,file);
});

test('verified predecessors are bounded, preserve exact code bytes and never recursively adopt older sets', async t => {
  const a = await predecessor(t), b = await predecessor(t, {number:'2'}), out = await fixture(t);
  const retained = await retain(out.root, [a.root, b.root]);
  assert.equal(retained.length, 2);
  assert.equal(await fs.readFile(path.join(out.root, 'app/js/bundles/app-1.js'), 'utf8'), "export const number = '1';");
  assert.ok(!await fs.stat(path.join(out.root, 'js/shared.js')).catch(() => null), 'No mutable root module is adopted');
  b.build.runtimePackaging.compatibility = retained.slice(0,1);
  b.build.runtimePackaging.retainedBundlePaths = Object.keys(retained[0].files).filter(p => p.startsWith('app/js/bundles/'));
  await b.put('build-manifest.json', json(b.build));
  const next = await fixture(t), onlyB = await retain(next.root, [b.root]);
  assert.equal(onlyB.length, 1); assert.ok(!onlyB[0].files['app/js/bundles/app-1.js']);
  await assert.rejects(retain(out.root, [a.root,a.root]), /distinct/);
  await assert.rejects(retain(out.root, [a.root,b.root,out.root]), /at most two/);
});

test('wrong environment, corrupted files and symlinks cannot partially publish a retained generation', async t => {
  const a = await predecessor(t), bad = await predecessor(t, {number:'2'}), production = await predecessor(t, {environment:'production'}), out = await fixture(t);
  await assert.rejects(retain(out.root, [production.root]), /environment/);
  await bad.put('app/js/bundles/app-2.js', 'damaged');
  await assert.rejects(retain(out.root, [a.root,bad.root]), /hash mismatch/);
  assert.deepEqual(await fs.readdir(out.root), [], 'All predecessors are checked before adoption');
  const file = path.join(a.root,'app/js/bundles/app-1.js'); await fs.rename(file,file+'.original'); await fs.symlink(file+'.original',file);
  await assert.rejects(retain(out.root,[a.root]), /ordinary files/);
});

test('legacy predecessor is admitted only with unchanged shared authorities', async t => {
  const a = await predecessor(t, {legacy:true}), out = await fixture(t);
  await out.put('js/shared.js', "export const generation = '1';"); await out.put('app/js/shared-context.js', 'export const ctx = {};');
  assert.equal((await retain(out.root,[a.root])).length,1);
  await out.put('js/shared.js', 'changed authority');
  await assert.rejects(retain(out.root,[a.root]), /changed root module/);
});

test('legacy pages keep their original root authorities while a new page uses independently pinned current source',async t=>{
  const old=await predecessor(t,{legacy:true,configuration:'same staging configuration'}),next=await predecessor(t,{number:'2',configuration:'same staging configuration'});
  const current=next.build.runtimePackaging.generation;
  const compatibility=await retainRuntimeGenerations({output:next.root,predecessors:[old.root],environment:'staging',projectId:'fixture-staging',currentGeneration:current});
  assert.equal(await fs.readFile(path.join(next.root,'js/shared.js'),'utf8'),"export const generation = '1';");
  assert.equal(await fs.readFile(path.join(next.root,current.prefix,'js/shared.js'),'utf8'),"export const generation = '2';");
  const assets={...next.assets.files,...compatibility[0].files};
  const rootModuleAliases=Object.fromEntries(Object.entries(assets).filter(([p])=>p.startsWith('js/')||p==='app/js/shared-context.js'));
  const packaging={...next.build.runtimePackaging,compatibility,rootModuleAliases,retainedBundlePaths:Object.keys(compatibility[0].files).filter(p=>p.startsWith('app/js/bundles/'))};
  assert.equal(verifyRuntimeGenerations(packaging,assets).size,1);
  assert.throws(()=>verifyRuntimeGenerations({...packaging,rootModuleAliases:{}},assets),/alias inventory/);
  const html=`<html lang="en"><script src="../js/shared.js"></script></html>`;
  const pinned=pinHtmlRootModules(html,'account/index.html',current,new Set(['js/shared.js']));
  assert.equal(pinHtmlRootModules(pinned,'account/index.html',current,new Set(['js/shared.js'])),pinned,'Current pages are completely sealed and metadata is idempotent');
});

test('legacy root adoption requires complete current proofs and cannot revive changed configuration or mix two legacy authorities',async t=>{
  const old=await predecessor(t,{legacy:true,configuration:'old configuration'}),next=await predecessor(t,{number:'2',configuration:'rotated configuration'});
  await assert.rejects(retainRuntimeGenerations({output:next.root,predecessors:[old.root],environment:'staging',projectId:'fixture-staging',currentGeneration:next.build.runtimePackaging.generation}),/revoked configuration/);
  assert.ok(!await fs.stat(path.join(next.root,'app/js/bundles/app-1.js')).catch(()=>null));
  const a=await predecessor(t,{legacy:true}),b=await predecessor(t,{legacy:true,number:'3'}),current=await predecessor(t,{number:'2'});
  const proof=structuredClone(current.build.runtimePackaging.generation);delete proof.files[`${proof.prefix.slice(1)}/js/shared.js`];
  await assert.rejects(retainRuntimeGenerations({output:current.root,predecessors:[a.root],environment:'staging',projectId:'fixture-staging',currentGeneration:proof}),/not pinned/);
  await assert.rejects(retainRuntimeGenerations({output:current.root,predecessors:[a.root,b.root],environment:'staging',projectId:'fixture-staging',currentGeneration:current.build.runtimePackaging.generation}),/collision/);
  assert.equal(await fs.readFile(path.join(current.root,'js/shared.js'),'utf8'),"export const generation = '2';",'Rejected predecessors cannot partially override current code');
});

test('current artifact verifies finite owned snapshots and rejects unexpected generations or changed hashes', async t => {
  const a = await predecessor(t), b = await predecessor(t,{number:'2'});
  const compatibility = await retain(b.root,[a.root]);
  const files = {...b.assets.files,...compatibility[0].files}, packaging = {...b.build.runtimePackaging, compatibility,
    retainedBundlePaths:Object.keys(compatibility[0].files).filter(p => p.startsWith('app/js/bundles/'))};
  assert.equal(verifyRuntimeGenerations(packaging,files).size,1);
  const oldPath = Object.keys(a.build.runtimePackaging.generation.files)[0];
  assert.throws(() => verifyRuntimeGenerations(packaging,{...files,[oldPath]:'0'.repeat(64)}), /mismatch/);
  assert.throws(() => verifyRuntimeGenerations(packaging,{...files,'runtime/unknown/js/key.js':'0'.repeat(64)}), /Unowned/);
  assert.throws(() => verifyRuntimeGenerations({...packaging,retainedBundlePaths:[]},files), /inventory/);
});
