import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readlinkSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { completeReleaseEnvironment } from './release-environment.mjs';

export const FINGERPRINT_CONTRACT = 'world-explorer-source-fingerprint-v2';
const classes = ['runtime', 'tests', 'environment', 'documentation'];
const digest = value => createHash('sha256').update(value).digest('hex');
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
export const SHIPPED_SOURCE_ENTRIES = Object.freeze(['about.html', 'favicon.svg', 'index.html',
  'about', 'account', 'app', 'assets', 'js', 'legal', 'styles']);

// Unknown inputs are runtime inputs. In particular, a README shipped inside
// app/assets is NOT documentation-only. Symlinks cannot opt out of acceptance.
export function fingerprintClass(file, mode = '100644') {
  if (mode === '120000') return 'runtime';
  if (/^(about|account|app|assets|js|legal|styles|functions)\//.test(file) ||
      ['index.html', 'about.html', 'favicon.svg'].includes(file)) return 'runtime';
  if (/^(tests|scripts\/(verification|architecture-evaluation))\//.test(file)) return 'tests';
  if (/^(config|\.github)\//.test(file) || /^(firebase[^/]*\.json|firestore\.[^/]+|storage\.rules|\.firebaserc)$/.test(file)) return 'environment';
  if (/^docs\/.*\.md$/.test(file) || /^[^/]+\.md$/.test(file)) return 'documentation';
  return 'runtime';
}

export function sourceFingerprint(root = process.cwd()) {
  const headCommit = git(root, ['rev-parse', 'HEAD']).trim();
  const rows = git(root, ['ls-files', '--stage', '-z']).split('\0').filter(Boolean);
  const modified = new Set(git(root, ['diff-files', '--no-ext-diff', '--name-only', '-z']).split('\0').filter(Boolean));
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  if (git(root, ['ls-files', '-v', '-z']).split('\0').some(row => row && /^[a-zS]/.test(row))) {
    throw new Error('Assume-unchanged or skip-worktree flags cannot hide release inputs');
  }
  const entries = new Map();
  for (const row of rows) {
    const match = /^(\d+) ([a-f0-9]+) (\d)\t([\s\S]+)$/.exec(row);
    if (!match || match[3] !== '0' || match[1] === '160000') throw new Error('Unmerged or submodule source cannot be accepted');
    entries.set(match[4], { mode: match[1], hash: match[2] });
  }
  const untrackedShipped = new Set();
  function includeShipped(file) {
    let stat;
    try { stat = lstatSync(path.join(root, file)); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stat.isDirectory()) {
      for (const name of readdirSync(path.join(root, file))) includeShipped(`${file}/${name}`);
    } else if (!entries.has(file)) { modified.add(file); untrackedShipped.add(file); }
  }
  for (const entry of SHIPPED_SOURCE_ENTRIES) includeShipped(entry);
  for (const [file, entry] of entries) {
    try {
      const stat = lstatSync(path.join(root, file));
      const mode = stat.isSymbolicLink() ? '120000' : stat.mode & 0o111 ? '100755' : '100644';
      if (mode !== entry.mode) modified.add(file);
    } catch (error) { if (error.code !== 'ENOENT') throw error; modified.add(file); }
  }
  for (const file of new Set([...modified, ...untracked])) {
    const absolute = path.join(root, file);
    let stat;
    try { stat = lstatSync(absolute); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      entries.delete(file); continue;
    }
    if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error('Unsupported source file type');
    const mode = stat.isSymbolicLink() ? '120000' : stat.mode & 0o111 ? '100755' : '100644';
    // Git blobs avoid rereading the multi-gigabyte unchanged asset set. Changed
    // files use raw bytes; link targets, executable bits and deletions matter.
    const hash = stat.isSymbolicLink()
      ? (() => { const bytes = Buffer.from(readlinkSync(absolute)); return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'); })()
      : git(root, ['hash-object', '--no-filters', '--', file]).trim();
    entries.set(file, { mode, hash });
  }
  const records = Object.fromEntries(classes.map(name => [name, []]));
  for (const [file, entry] of [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    records[fingerprintClass(file, entry.mode)].push([file, entry.mode, entry.hash]);
  }
  const fingerprints = Object.fromEntries(classes.map(name => [name, digest(JSON.stringify(records[name]))]));
  const workspaceFingerprint = digest(JSON.stringify(fingerprints));
  const environment = completeReleaseEnvironment(process.env);
  // Only reviewed routing/options enter this digest. Never serialize credential
  // values or full environment maps into a release report.
  const executionEnvironmentFingerprint = digest(JSON.stringify({
    node: process.version, platform: process.platform, arch: process.arch, kernel: os.release(),
    cpu: os.cpus()[0]?.model, memory: os.totalmem(),
    debugAttestation: !!environment.WE3D_STAGING_APP_CHECK_FILE,
    captureAttestation: !!environment.WE3D_CAPTURE_AUTOMATION_ATTESTATION,
    options: ['WE3D_VERIFY_ENGINE', 'WE3D_VERIFY_HOSTED_PLACE_LOOKUP', 'WE3D_REAL_GPU',
      'WE3D_PLACE_LOOKUP_EMULATOR_ORIGIN', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST',
      'FIREBASE_STORAGE_EMULATOR_HOST', 'GCLOUD_PROJECT', 'GCLOUD_PROJECT_ID', 'GOOGLE_CLOUD_PROJECT',
      'JAVA_TOOL_OPTIONS', 'WE3D_EXPECT_BUILD_ID', 'WE3D_EXPECT_ENVIRONMENT', 'WE3D_EXPECT_TAG'].map(key => [key, environment[key] || ''])
  }));
  const acceptanceFingerprint = digest(JSON.stringify([fingerprints.runtime, fingerprints.tests, fingerprints.environment]));
  return Object.freeze({ contract: FINGERPRINT_CONTRACT, headCommit, workspaceFingerprint, acceptanceFingerprint,
    fingerprints, executionEnvironmentFingerprint, dirty: untrackedShipped.size > 0 || git(root, ['status', '--porcelain', '-z', '--untracked-files=normal']).length > 0,
    untrackedShippedCount: untrackedShipped.size,
    untrackedCount: untracked.length });
}

export function sameAcceptanceSource(left, right) {
  return left?.contract === FINGERPRINT_CONTRACT && right?.contract === FINGERPRINT_CONTRACT &&
    /^[a-f0-9]{64}$/.test(left.acceptanceFingerprint || '') && left.acceptanceFingerprint === right.acceptanceFingerprint;
}
