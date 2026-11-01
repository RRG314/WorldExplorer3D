import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildPortalCatalog,nativePortalCatalog} from '../scripts/build-portal-catalog.mjs';
import {PORTAL_CATALOG} from '../app/js/portal/catalog.js';
import {portalFixture} from './fixtures/portal-qualification.mjs';
test('browser service and native bundled fallbacks publish the exact same sourced catalog and game intent vocabulary',async()=>{
  const text=await buildPortalCatalog({write:false});for(const name of ['portal/catalog.json','android/app/src/main/assets/portal-catalog.json','apple/Shared/Resources/portal-catalog.json'])assert.equal(await fs.readFile(new URL('../'+name,import.meta.url),'utf8'),text);
  const catalog=JSON.parse(text);assert.equal(catalog.destinations.length,PORTAL_CATALOG.destinations.length);assert.deepEqual(catalog.qualifications,PORTAL_CATALOG.qualifications);
  assert.deepEqual(catalog.offers.map(row=>[row.destinationId,row.deviceProfile]).sort(),[
    ['baltimore-harbor','desktop'],['baltimore-harbor','mobile-touch']
  ]);
  assert.equal(catalog.offers.some(row=>row.destinationId==='monaco-coast'),false,'Learning content is not an assessment of an unreviewed world');
  for(const place of catalog.destinations){const link=new URL(place.gameLink,'https://worldexplorer3d.io');assert.deepEqual([...link.searchParams.keys()],['portal','pr']);assert.ok(place.learning.sources.length>0);}
});
test('native game offers derive from the complete shared qualification gate, retaining expiry and device scope',()=>{
  const f=portalFixture({deviceProfile:'mobile-touch'}),approved=nativePortalCatalog(f.catalog);
  assert.equal(approved.offers.length,1);assert.equal(approved.offers[0].validUntil,f.qualification.validUntil);assert.equal(approved.offers[0].deviceProfile,'mobile-touch');
  for(const change of [q=>q.layers.transport='missing',q=>q.checks.safeArrival='unknown',q=>q.origin={lat:0,lon:0},q=>q.experienceIds=[],q=>q.renderContractVersion='stale']){
    const copy=structuredClone(f.catalog);change(copy.qualifications[0]);assert.equal(nativePortalCatalog(copy).offers.length,0);
  }
});
