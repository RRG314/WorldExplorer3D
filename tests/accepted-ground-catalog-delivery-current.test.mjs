import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parseAcceptedGroundCatalog} from '../app/js/terrain/accepted-ground-catalog.js';

test('every ground catalogue artifact resolves inside both source and immutable delivery roots with identical content',()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../app/assets/ground/manifest-catalog.json',import.meta.url),'utf8'));
 for(const directory of ['/app/assets/ground/','/location-data/ground/0123456789abcdef/']){
  const parsed=parseAcceptedGroundCatalog(catalog,{url:`https://worldexplorer.example${directory}manifest-catalog.json`});
  assert.equal(parsed.status,'accepted');
  for(const manifest of parsed.manifests){
   const url=new URL(manifest.url);
   assert.equal(url.origin,'https://worldexplorer.example');
   assert.ok(url.pathname.startsWith(directory),`${manifest.artifactId} escaped the selected ground release: ${url.pathname}`);
   const relative=url.pathname.slice(directory.length);
   const bytes=fs.readFileSync(new URL(`../app/assets/ground/${relative}`,import.meta.url));
   assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.contentSha256,manifest.artifactId);
  }
 }
});
