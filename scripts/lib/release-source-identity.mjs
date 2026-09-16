import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

// A missing repository or failed status command must never imply clean source.
export function readReleaseSourceIdentity(root = process.cwd()) {
  const git = (args) => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  try {
    if (realpathSync(git(['rev-parse', '--show-toplevel'])) !== realpathSync(root)) {
      throw new Error('Build directory is not the repository root.');
    }
    const commit = git(['rev-parse', '--verify', 'HEAD^{commit}']);
    const commitTime = git(['show', '-s', '--format=%cI', commit]);
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit) || !Number.isFinite(Date.parse(commitTime))) {
      throw new Error('Invalid source commit or timestamp.');
    }
    const sourceDirty = git(['status', '--porcelain=v1', '--untracked-files=normal']).length > 0;
    return { commit, commitTime, sourceDirty };
  } catch (cause) {
    throw new Error('Cannot establish release source identity; use a readable Git worktree with a committed HEAD.', { cause });
  }
}

export function assertReleaseSourceIdentity(manifest, source) {
  if (manifest.commit !== source.commit || manifest.commitTime !== source.commitTime ||
      manifest.buildTimestamp !== source.commitTime || manifest.sourceDirty !== source.sourceDirty) {
    throw new Error('Hosting artifact source identity does not match the current Git worktree.');
  }
}
