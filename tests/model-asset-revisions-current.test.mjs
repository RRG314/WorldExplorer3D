import test from 'node:test';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{readFile}from'node:fs/promises';
import{MODEL_ASSET_CATALOG}from'../app/js/assets/model-asset-catalog.js';
import{MODEL_ASSET_REVISIONS}from'../app/js/assets/model-asset-revisions.js';
import{modelAssetRequestUrl}from'../app/js/assets/model-asset-url.js';
test('every immutable bundled model has a cache identity matching its bytes',async()=>{
 for(const asset of MODEL_ASSET_CATALOG){
  const bytes=await readFile(new URL(`..${asset.url}`,import.meta.url));
  const expected=createHash('sha256').update(bytes).digest('hex').slice(0,16);
  assert.equal(MODEL_ASSET_REVISIONS[asset.id],expected,asset.id);
  const url=new URL(modelAssetRequestUrl(asset),'http://localhost');
  assert.equal(url.pathname,asset.url);assert.equal(url.searchParams.get('revision'),expected);
 }
});
