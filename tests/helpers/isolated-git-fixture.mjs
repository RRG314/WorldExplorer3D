import path from 'node:path';

// These files execute in separate Node test workers. Keep their disposable Git
// repositories isolated even when the caller uses an external worktree/index.
export function isolateGitFixture(t, root) {
  const previous = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.startsWith('GIT_')),
  );
  for (const key of Object.keys(previous)) delete process.env[key];
  process.env.GIT_DIR = path.join(root, '.git');
  process.env.GIT_WORK_TREE = root;
  process.env.GIT_INDEX_FILE = path.join(root, '.git', 'index');
  t.after(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('GIT_')) delete process.env[key];
    }
    Object.assign(process.env, previous);
  });
}
