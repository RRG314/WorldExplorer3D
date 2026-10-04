import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { sourceFingerprint as currentBaseline, sameAcceptanceSource } from './source-fingerprint.mjs';
import { artifactIdentity as currentArtifactIdentity, sameArtifactIdentity } from './artifact-identity.mjs';

const EVIDENCE_RELATIVE_PATH = 'output/release-evidence/current/execution-manifest.json';

function evidencePath(root = process.cwd(), scope = 'candidate') {
  const filename = scope === 'candidate' ? 'execution-manifest.json' : `${scope}-execution-manifest.json`;
  return path.join(root, 'output', 'release-evidence', 'current', filename);
}

function readExecutionEvidence(root = process.cwd(), scope = 'candidate') {
  const target = evidencePath(root, scope);
  if (!existsSync(target)) return null;
  try {
    return JSON.parse(readFileSync(target, 'utf8'));
  } catch {
    return null;
  }
}

function compareEvidenceToBaseline(evidence, baseline, scope = 'candidate', artifact = currentArtifactIdentity()) {
  if (!evidence) return ['current execution evidence is missing'];
  const failures = [];
  if (evidence.contract !== 'world-explorer-execution-evidence-v2') failures.push('execution evidence contract is invalid');
  if (!sameAcceptanceSource(evidence.baseline, baseline)) failures.push('execution evidence does not match current runtime, tests or environment inputs');
  if (evidence.ok !== true) failures.push('the current execution matrix did not pass');
  if (evidence.scope !== scope) failures.push(`the current execution evidence is not the complete ${scope} scope`);
  if (!sameArtifactIdentity(evidence.artifactIdentity, artifact)) failures.push('execution evidence does not match the verified current artifact bytes');
  return failures;
}

export {
  EVIDENCE_RELATIVE_PATH,
  compareEvidenceToBaseline,
  currentArtifactIdentity,
  currentBaseline,
  evidencePath,
  readExecutionEvidence,
  sameArtifactIdentity,
  sameAcceptanceSource
};
