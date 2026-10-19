import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Browser SDKs must use the same disposable database as the Admin SDK and
// Functions. Hardcoded default ports can silently connect a different project.
export function browserEmulatorSettings(environment = process.env) {
  function port(key) {
    const match = /^(?:127\.0\.0\.1|localhost):(\d+)$/.exec(String(environment[key] || ''));
    const value = Number(match?.[1]);
    if (!match || !Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error(`A selected local emulator endpoint is required: ${key}`);
    }
    return value;
  }
  return Object.freeze({
    enabled: true, host: '127.0.0.1',
    authPort: port('FIREBASE_AUTH_EMULATOR_HOST'),
    firestorePort: port('FIRESTORE_EMULATOR_HOST'),
    ...(environment.FIREBASE_STORAGE_EMULATOR_HOST
      ? { storagePort: port('FIREBASE_STORAGE_EMULATOR_HOST') } : {})
  });
}

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
