import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGETED_RELEASE_CHECKS,validateTargetedReleaseDecision} from '../scripts/verification/targeted-release-decision.mjs';
const baseline={contract:'world-explorer-source-fingerprint-v2',acceptanceFingerprint:'a'.repeat(64),dirty:false};
const artifact={buildManifestSha256:'b'.repeat(64),assetManifestSha256:'c'.repeat(64),verifiedContentSha256:'d'.repeat(64),fileCount:10};
const ref={path:'output/release-evidence/receipt.json',sha256:'e'.repeat(64)};
const context={baseline,artifact,now:Date.parse('2026-10-19T18:00:00Z'),verifyFile:file=>file?.sha256===ref.sha256};
const decision=()=>({contract:'world-explorer-targeted-release-decision-v1',baseline,artifactIdentity:artifact,decision:'release',reviewer:'Reviewer',scopeReview:ref,observedAt:'2026-10-19T17:00:00Z',checks:Object.fromEntries(TARGETED_RELEASE_CHECKS.map(id=>[id,{accepted:true,method:'retained-with-review',rationale:'Unchanged inputs reviewed',evidence:[ref]}])),findings:[]});
test('targeted admission distinguishes reviewed reuse from a passed full matrix',()=>{
 const result=validateTargetedReleaseDecision(decision(),context);assert.equal(result.ready,true);assert.equal(result.fullMatrixPassed,false);
});
test('changed source, package, evidence and missing checks prevent admission',()=>{
 for(const mutate of [d=>d.baseline={...baseline,acceptanceFingerprint:'f'.repeat(64)},d=>d.artifactIdentity={...artifact,assetManifestSha256:'f'.repeat(64)},d=>d.checks['hosted-smoke'].evidence=[{...ref,sha256:'f'.repeat(64)}],d=>delete d.checks['save-compatibility'],d=>d.observedAt='2020-01-01']){
  const d=decision();mutate(d);assert.throws(()=>validateTargetedReleaseDecision(d,context));
 }
});
test('failed checks and unresolved findings cannot be hidden as reuse',()=>{
 const d=decision();d.checks['dense-city-load'].accepted=false;assert.throws(()=>validateTargetedReleaseDecision(d,context));
 const f=decision();f.findings=[{disposition:'unresolved',originalEvidence:[ref],reason:'Still broken'}];assert.throws(()=>validateTargetedReleaseDecision(f,context));
 f.findings[0].disposition='resolved';assert.throws(()=>validateTargetedReleaseDecision(f,context));
 f.findings[0].resolutionEvidence=[ref];assert.equal(validateTargetedReleaseDecision(f,context).ready,true);
});
