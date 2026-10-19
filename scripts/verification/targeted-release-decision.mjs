import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {sameAcceptanceSource} from './source-fingerprint.mjs';
import {sameArtifactIdentity} from './artifact-identity.mjs';

// An explicitly reviewed maintenance release can retain relevant completed
// evidence. This decision never rewrites a failed/interrupted matrix as passed.
export const TARGETED_RELEASE_CHECKS=Object.freeze([
  'focused-regression','dense-city-load','venue-recovery','artifact-integrity',
  'backend-compatibility','save-compatibility','hosted-smoke','mobile-controls',
  'public-data-rights','performance-review'
]);
export function validateTargetedReleaseDecision(decision,{baseline,artifact,verifyFile,now=Date.now()}){
  assert.equal(decision?.contract,'world-explorer-targeted-release-decision-v1');
  assert.ok(sameAcceptanceSource(decision.baseline,baseline),'Reviewed source inputs changed');
  assert.ok(sameArtifactIdentity(decision.artifactIdentity,artifact),'Reviewed package changed');
  assert.equal(baseline.dirty,false,'Review requires clean source');
  assert.equal(decision.decision,'release');
  assert.ok(typeof decision.reviewer==='string'&&decision.reviewer.trim());
  assert.ok(verifyFile(decision.scopeReview),'Missing or changed scope review');
  const observed=Date.parse(decision.observedAt);
  assert.ok(Number.isFinite(observed)&&observed<=now&&now-observed<7*86400000,'Stale release decision');
  for(const id of TARGETED_RELEASE_CHECKS){
    const check=decision.checks?.[id];
    assert.equal(check?.accepted,true,`Unresolved required check: ${id}`);
    assert.ok(['executed','retained-with-review'].includes(check.method),`Missing evidence method: ${id}`);
    assert.ok(typeof check.rationale==='string'&&check.rationale.trim(),`Missing rationale: ${id}`);
    assert.ok(check.evidence?.length>0&&check.evidence.every(verifyFile),`Missing or changed evidence: ${id}`);
  }
  assert.ok(Array.isArray(decision.findings),'Findings must be accounted for');
  for(const finding of decision.findings){
    assert.ok(['resolved','external-service-limitation','device-performance-limitation','interrupted-extra-check'].includes(finding.disposition),'Unresolved finding');
    assert.ok(finding.originalEvidence?.length>0&&finding.originalEvidence.every(verifyFile),'Original finding evidence missing');
    assert.ok(typeof finding.reason==='string'&&finding.reason.trim());
    if(finding.disposition==='resolved')assert.ok(finding.resolutionEvidence?.length>0&&finding.resolutionEvidence.every(verifyFile),'Resolution evidence missing');
  }
  return {ready:true,mode:'reviewed-targeted-release',fullMatrixPassed:false,checks:Object.keys(decision.checks),findings:decision.findings.length};
}
export function readTargetedReleaseDecision(root,file,context){
  const evidenceRoot=realpathSync(path.join(root,'output/release-evidence'))+path.sep;
  const verifyFile=reference=>{
    try{
      if(!/^[a-f0-9]{64}$/.test(reference?.sha256||''))return false;
      const resolved=realpathSync(path.resolve(root,reference.path));
      if(!resolved.startsWith(evidenceRoot))return false;
      return createHash('sha256').update(readFileSync(resolved)).digest('hex')===reference.sha256;
    }catch{return false;}
  };
  return validateTargetedReleaseDecision(JSON.parse(readFileSync(path.resolve(root,file),'utf8')),{...context,verifyFile});
}
