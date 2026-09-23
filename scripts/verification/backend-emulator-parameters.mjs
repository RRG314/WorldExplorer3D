import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

// Firebase's parameter loader prompts even with --non-interactive when the
// optional billing/mail parameters are unset. Tests use non-service values;
// they must never need a live payment or email credential to start emulators.
export function prepareBackendEmulatorParameters(root = process.cwd()) {
  const file = path.join(root, 'functions/.env.local');
  if (existsSync(file)) return () => {};
  const source = readFileSync(path.join(root, 'functions/index.js'), 'utf8');
  const names = [...new Set([...source.matchAll(/defineString\('(WE3D_[A-Z_]+)'/g)].map(match => match[1]))];
  if (!names.length) throw new Error('No emulator parameters found; review the Functions parameter contract.');
  const content = '# Generated emulator-only parameters; no service credentials\n' +
    names.map(name => `${name}=${name === 'WE3D_STRIPE_PRICE_PRO' ? 'price_emulator_pro' : name === 'WE3D_STRIPE_PRICE_SUPPORTER' ? 'price_emulator_supporter' : 'local-emulator-unused'}\n`).join('');
  writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
  return () => {
    if (existsSync(file) && readFileSync(file, 'utf8') === content) unlinkSync(file);
  };
}
