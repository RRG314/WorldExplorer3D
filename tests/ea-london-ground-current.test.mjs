import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {compileGroundArtifact} from '../app/js/terrain/ground-artifact.js';
import {selectGroundArtifact} from '../app/js/terrain/ground-provider-registry.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const artifact=read('../app/assets/ground/london/ground-artifact.json');
const manifest=read('../app/assets/ground/london/ground-manifest.json');
const catalog=read('../app/assets/ground/manifest-catalog.json');
const byCell=new Map(artifact.samples.map(s=>[`${s.column},${s.row}`,s]));
test('London publishes complete bare-earth ground with bound source and datum evidence',()=>{
 assert.equal(manifest.providerId,'ea-lidar-composite-dtm-2022');
 assert.equal(compileGroundArtifact({manifest,artifact}).status,'accepted');
 assert.equal(selectGroundArtifact({latitude:51.5074,longitude:-.1278,manifests:catalog.manifests}).manifest.providerId,manifest.providerId);
 const bytes=fs.readFileSync(new URL('../app/assets/ground/london/ground-artifact.json',import.meta.url));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.contentSha256);
 assert.equal(artifact.samples.length,6724);
 assert.ok(artifact.samples.every(s=>s.available&&s.confidence>=artifact.minimumConfidence&&Number.isFinite(s.groundElevationMeters)&&s.normalizationUncertaintyMeters>=8.038));
 assert.equal(manifest.sourceEvidence.normalization.grids.length,3);
 assert.match(manifest.attribution.notice,/Environment Agency/);
});
test('London terrain agrees with independent bare-earth check points at declared coarse resolution',()=>{
 const fixture=read('./fixtures/ea-london-independent-ground.json');
 for(const reference of fixture.samples){
  const s=byCell.get(`${reference.column},${reference.row}`);
  // The pinned PROJ transformation is spatially near 0.541 m here. Compare
  // the published coarse-cell mean to the independent 1 m point allowing
  // local relief inside the roughly 56 m footprint, not a false 1 m claim.
  assert.ok(Math.abs((reference.eaDtmOdnMeters-.541)-s.groundElevationMeters)<1.2,`bare-earth disagreement at ${reference.column},${reference.row}`);
 }
 const west=byCell.get('-157,74573').groundElevationMeters;
 const east=byCell.get('-156,74573').groundElevationMeters;
 assert.ok(east<west,'the independently observed eastward ground fall must not become a rooftop-height rise');
});
