import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function prepareBillingEmulatorFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'we3d-billing-fixture-'));
  const file = path.join(directory, 'subscription.json');
  writeFileSync(file, JSON.stringify({ status: 503, body: { error: { message: 'Fixture not initialized' } } }), { mode: 0o600 });
  writeFileSync(`${file}.requests`, '', { mode: 0o600 });
  const preload = fileURLToPath(new URL('./billing-sdk-fixture.cjs', import.meta.url));
  return {
    env: {
      WE3D_VERIFICATION_STRIPE_FIXTURE: file,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${JSON.stringify(preload)}`.trim()
    },
    cleanup: () => rmSync(directory, { recursive: true, force: true })
  };
}
