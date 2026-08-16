import { execFileSync } from 'node:child_process';

function runGit(rootDir, args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

export function getReleaseEvidenceIdentity({ rootDir = process.cwd() } = {}) {
  const commit = runGit(rootDir, ['rev-parse', 'HEAD']);
  const sourceStatus = runGit(rootDir, [
    'status',
    '--porcelain=v1',
    '--untracked-files=normal'
  ]);
  return Object.freeze({
    schemaVersion: 1,
    commit,
    sourceDirty: sourceStatus.length > 0
  });
}

export function evaluateReleaseEvidenceIdentity(
  evidence = {},
  current = {}
) {
  const expectedCommit = String(current.commit || '');
  const evidenceCommit = String(evidence.commit || '');
  const schemaValid = evidence.schemaVersion === 1;
  const commitPresent = /^[0-9a-f]{40}$/i.test(evidenceCommit);
  const currentCommitPresent = /^[0-9a-f]{40}$/i.test(expectedCommit);
  const commitMatches =
    commitPresent &&
    currentCommitPresent &&
    evidenceCommit.toLowerCase() === expectedCommit.toLowerCase();
  const evidenceSourceClean = evidence.sourceDirty === false;
  const currentSourceClean = current.sourceDirty === false;

  return Object.freeze({
    ok:
      schemaValid &&
      commitMatches &&
      evidenceSourceClean &&
      currentSourceClean,
    schemaValid,
    commitPresent,
    commitMatches,
    evidenceSourceClean,
    currentSourceClean,
    expectedCommit,
    evidenceCommit
  });
}
