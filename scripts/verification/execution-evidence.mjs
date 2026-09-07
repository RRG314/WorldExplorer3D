import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const EVIDENCE_RELATIVE_PATH = 'output/release-evidence/current/execution-manifest.json';

function git(root, args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: options.encoding || 'utf8',
    maxBuffer: 256 * 1024 * 1024
  });
}

function currentBaseline(root = process.cwd()) {
  const headCommit = git(root, ['rev-parse', 'HEAD']).trim();
  const trackedDiff = git(root, [
    'diff', '--binary', 'HEAD', '--', '.',
    ':(exclude)output/**',
    ':(exclude)dist/**',
    ':(exclude)progress.md'
  ]);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean)
    .sort();
  const hash = createHash('sha256');
  hash.update(`head\0${headCommit}\0`);
  hash.update(trackedDiff);
  for (const relative of untracked) {
    hash.update(`untracked\0${relative}\0`);
    hash.update(git(root, ['hash-object', '--', relative]).trim());
    hash.update('\0');
  }
  return Object.freeze({
    headCommit,
    workspaceFingerprint: hash.digest('hex'),
    dirty: trackedDiff.length > 0 || untracked.length > 0,
    untrackedCount: untracked.length
  });
}

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

function compareEvidenceToBaseline(evidence, baseline, scope = 'candidate') {
  if (!evidence) return ['current execution evidence is missing'];
  const failures = [];
  if (evidence.contract !== 'world-explorer-execution-evidence-v1') failures.push('execution evidence contract is invalid');
  if (evidence.baseline?.headCommit !== baseline.headCommit) failures.push('execution evidence commit does not match the current HEAD');
  if (evidence.baseline?.workspaceFingerprint !== baseline.workspaceFingerprint) failures.push('execution evidence does not match the current working tree');
  if (evidence.ok !== true) failures.push('the current execution matrix did not pass');
  if (evidence.scope !== scope) failures.push(`the current execution evidence is not the complete ${scope} scope`);
  return failures;
}

export {
  EVIDENCE_RELATIVE_PATH,
  compareEvidenceToBaseline,
  currentBaseline,
  evidencePath,
  readExecutionEvidence
};
