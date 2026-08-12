import assert from 'node:assert/strict';
import {
  evaluateReleaseEvidenceIdentity,
  getReleaseEvidenceIdentity
} from './release-evidence-identity.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';
const current = {
  schemaVersion: 1,
  commit,
  sourceDirty: false
};

assert.equal(evaluateReleaseEvidenceIdentity(current, current).ok, true);
assert.equal(evaluateReleaseEvidenceIdentity({}, current).ok, false);
assert.equal(evaluateReleaseEvidenceIdentity({
  ...current,
  commit: 'fedcba9876543210fedcba9876543210fedcba98'
}, current).commitMatches, false);
assert.equal(evaluateReleaseEvidenceIdentity({
  ...current,
  sourceDirty: true
}, current).evidenceSourceClean, false);
assert.equal(evaluateReleaseEvidenceIdentity(current, {
  ...current,
  sourceDirty: true
}).currentSourceClean, false);

const repositoryIdentity = getReleaseEvidenceIdentity();
assert.match(repositoryIdentity.commit, /^[0-9a-f]{40}$/i);
assert.equal(typeof repositoryIdentity.sourceDirty, 'boolean');

console.log(JSON.stringify({
  ok: true,
  contract: 'release-evidence-identity',
  staleCommitRejected: true,
  dirtyEvidenceRejected: true,
  dirtyCandidateRejected: true
}, null, 2));
