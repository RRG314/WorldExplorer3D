import { spawnSync } from 'node:child_process';

function runNodeVerificationSteps(steps, options = {}) {
  const label = String(options.label || 'verification');
  const recordDurations = options.recordDurations === true;
  const startedAt = performance.now();
  const results = [];

  for (const [name, script, args = []] of steps) {
    console.log(`\n=== ${name} ===`);
    const stepStartedAt = performance.now();
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit'
    });
    const durationMs = Math.round(performance.now() - stepStartedAt);
    results.push({ name, script, durationMs, passed: result.status === 0 });
    if (result.status !== 0) {
      console.error(`\n[${label}] Failed at step: ${name}`);
      if (recordDurations) {
        console.error(JSON.stringify({ durationMs, completed: results }, null, 2));
      }
      process.exit(result.status || 1);
    }
  }

  return Object.freeze({
    durationMs: Math.round(performance.now() - startedAt),
    results: Object.freeze(results.map((result) => Object.freeze(result)))
  });
}

export { runNodeVerificationSteps };
