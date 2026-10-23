import os from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

export async function gameplayQaEnvironment(base) {
  const response = await fetch(base + '/build-manifest.json');
  assert.equal(response.status, 200, 'QA target manifest is unavailable');
  const manifest = await response.json();
  assert.equal(manifest.firebaseProjectId, 'we3d-staging-20260712', 'Use staging for gameplay QA');
  assert.match(manifest.commit, /^[a-f0-9]{40}$/, 'Invalid target source identity');
  // QA scripts and package-script edits do not require rebuilding identical game
  // bytes. Refuse to test an older hosted game after changing delivered source.
  try {
    execFileSync('git', ['diff', '--quiet', manifest.commit, '--', 'app', 'js', 'assets', 'styles', 'account', 'legal', 'modules', 'about', 'index.html', 'about.html'], {stdio:'ignore'});
  } catch {
    throw Error('Hosted game source differs from this workspace. Test a matching staging artifact before accepting results.');
  }
  const chrome = process.platform === 'darwin'
    ? execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print CFBundleShortVersionString', '/Applications/Google Chrome.app/Contents/Info.plist'], {encoding:'utf8'}).trim()
    : process.env.WE3D_QA_CHROME_VERSION || 'unverified';
  return {base, project:manifest.firebaseProjectId, chrome, platform:process.platform,
    architecture:process.arch, cpu:os.cpus()[0]?.model, memoryBytes:os.totalmem(), kernel:os.release(),
    targetBuildObserved:manifest.buildId, targetSourceObserved:manifest.commit};
}

export function environmentIdentity(environment) {
  // A different build wrapper alone does not invalidate unchanged feature code.
  const {targetBuildObserved, targetSourceObserved, ...identity} = environment;
  return identity;
}
