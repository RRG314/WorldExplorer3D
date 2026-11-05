import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runNativePrototypes } from '../../docs/career-world-integration/native-prototypes.js';
const require = createRequire(import.meta.url);
const { requireExpeditionMembership } = require('../../functions/expedition-room-access.js');
const result = await runNativePrototypes();
const stamp = (n) => ({ toMillis: () => n });
let leaseChecks = 0;
for (const uid of ['rnd-geologist', 'rnd-pilot']) {
  requireExpeditionMembership(
    {},
    { uid, lastSeenAt: stamp(900), expiresAt: stamp(2000) },
    uid,
    1000
  );
  leaseChecks++;
}
for (const [player, uid] of [
  [{ uid: 'rnd-geologist', lastSeenAt: stamp(900), expiresAt: stamp(999) }, 'rnd-geologist'],
  [{ uid: 'someone-else', lastSeenAt: stamp(900), expiresAt: stamp(2000) }, 'rnd-pilot'],
]) {
  let rejected = false;
  try {
    requireExpeditionMembership({}, player, uid, 1000);
  } catch {
    rejected = true;
  }
  if (!rejected) throw Error('Invalid server membership admitted');
  leaseChecks++;
}
result.serverMembership = {
  checks: leaseChecks,
  scope: 'Existing server lease boundary with controlled timestamp records; no live room created.',
};
await fs.mkdir('output/research/career-world-20261105', { recursive: true });
await fs.writeFile(
  'output/research/career-world-20261105/native-prototypes.json',
  JSON.stringify(result, null, 2) + '\n'
);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
