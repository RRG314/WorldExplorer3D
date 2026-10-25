import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {prepareBackendEmulatorParameters} from './backend-emulator-parameters.mjs';

// A demo project cannot reach production. Keep one emulator/browser sequence,
// and allow a UI-only rerun without repeating unchanged rule checks.
const childMode = process.argv.includes('--inside-emulators');
const browserOnly = process.argv.includes('--browser-only');
async function run(command, args, env = process.env) {
  const child = spawn(command, args, {stdio:'inherit', env});
  const stop = () => child.kill('SIGTERM');
  process.once('SIGTERM', stop);
  try {
    const code = await new Promise((resolve,reject) => { child.once('error',reject); child.once('exit',resolve); });
    if (code !== 0) throw new Error(`${command} exited with ${code}`);
  } finally { process.removeListener('SIGTERM', stop); }
}
if (childMode) {
  if (!browserOnly) await run(process.execPath, ['--test','--test-concurrency=1','tests/community-safety-rules.test.mjs']);
  await run(process.execPath, ['scripts/verification/community-safety-current.mjs']);
  await run(process.execPath, ['scripts/verification/world-exploration-settings-current.mjs']);
} else {
  const cleanup = prepareBackendEmulatorParameters();
  const localJdk = '/opt/homebrew/opt/openjdk@21';
  const env = {...process.env, JAVA_TOOL_OPTIONS:'-Xmx384m'};
  if (!env.JAVA_HOME && existsSync(localJdk+'/bin/java')) {
    env.JAVA_HOME = localJdk; env.PATH = localJdk+'/bin:'+env.PATH;
  }
  try {
    await run('firebase',['emulators:exec','--config','firebase.community-emulator.json','--only','auth,firestore,functions','--project','demo-we3d-community','--non-interactive',`node scripts/verification/community-safety-emulators.mjs --inside-emulators${browserOnly?' --browser-only':''}`],env);
  } finally { cleanup(); }
}
