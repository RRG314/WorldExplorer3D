import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function backendVerificationCommand(environment = process.env) {
  const hosts = ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST'];
  const configured = hosts.filter(key => String(environment[key] || '').trim());
  if (configured.length && configured.length !== hosts.length) {
    throw new Error('Backend verification needs all Auth, Firestore and Storage emulators; refusing a partial environment');
  }
  // system-release can run inside an already owned emulator lifecycle. Do not
  // start a second emulator set on the same ports in that case.
  return configured.length
    ? [process.execPath, 'scripts/verification/backend-release.mjs']
    : [process.execPath, 'scripts/verification/backend-isolated.mjs'];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = backendVerificationCommand();
  const child = spawn(command, args, { stdio: 'inherit', env: process.env });
  child.on('error', error => { console.error(error); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}
