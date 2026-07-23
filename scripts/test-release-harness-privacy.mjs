import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('./test-release-retention.mjs', import.meta.url), 'utf8');
const resultStart = source.indexOf('const result = {');
const resultEnd = source.indexOf('\n  };', resultStart);
assert.ok(resultStart >= 0 && resultEnd > resultStart, 'Unable to inspect the staging retention result object.');
const resultBlock = source.slice(resultStart, resultEnd);

assert.doesNotMatch(
  resultBlock,
  /^\s*(email|password)\s*,?\s*$/m,
  'The staging retention report must not retain generated credentials.'
);
assert.match(
  source,
  /console\.log\(redactReport\(result,\s*\[email,\s*password,\s*result\.authUid,\s*result\.roomCode\]\)\)/,
  'The staging retention report must redact credentials and temporary identifiers before logging.'
);
assert.match(
  source,
  /result\.cleanup\s*=\s*await cleanupStagingAccount/,
  'The staging retention gate must clean up its synthetic account.'
);
assert.match(
  source,
  /assert\(result\.cleanup\.accountDeleted/,
  'Successful retention certification must require confirmed account deletion.'
);

console.log(JSON.stringify({ ok: true }, null, 2));
