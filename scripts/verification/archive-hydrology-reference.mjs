import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sourceUrl =
  'https://api.waterdata.usgs.gov/ogcapi/v1/collections/daily/items?f=json&monitoring_location_id=USGS-01589300&parameter_code=00060&statistic_id=00003&time=2024-01-01%2F2024-01-03&limit=10';
try {
  await fs.access('app/js/campaign/hydrology-reference.js');
  throw Error(
    'The versioned reference already exists. Preserve it; choose a new reference/version before refreshing.'
  );
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(10000) });
assert.equal(response.ok, true);
const bytes = Buffer.from(await response.arrayBuffer()),
  raw = JSON.parse(bytes);
assert.equal(raw.features?.length, 3);
const observations = raw.features
  .map((f) => f.properties)
  .sort((a, b) => a.time.localeCompare(b.time));
for (const p of observations) {
  assert.equal(p.monitoring_location_id, 'USGS-01589300');
  assert.equal(p.parameter_code, '00060');
  assert.equal(p.statistic_id, '00003');
  assert.equal(p.unit_of_measure, 'ft^3/s');
  assert.ok(Number.isFinite(Number(p.value)));
  assert.equal(p.approval_status, 'Approved');
}
assert.deepEqual(
  observations.map((p) => p.time),
  ['2024-01-01', '2024-01-02', '2024-01-03']
);
const data = {
  id: 'usgs-01589300-daily-2024-01-v1',
  truthType: 'archived-public-gauge',
  stationId: 'USGS-01589300',
  stationName: 'Gwynns Falls at Villa Nova, Maryland',
  sourceUrl,
  retrievedAt: new Date().toISOString(),
  sha256: createHash('sha256').update(bytes).digest('hex'),
  unit: 'ft^3/s',
  statistic: 'daily-mean',
  parameterCode: '00060',
  observations: observations.map((p) => ({
    date: p.time,
    value: Number(p.value),
    approval: p.approval_status,
    lastModified: p.last_modified,
  })),
  limit:
    'Historical daily means at a different real river, not contemporaneous measurements or a cause of the virtual training reach.',
};
await fs.mkdir('app/data/hydrology', { recursive: true });
await fs.writeFile('app/data/hydrology/usgs-01589300-daily-2024-01-raw.json', bytes);
await fs.writeFile(
  'app/js/campaign/hydrology-reference.js',
  '// Archived USGS daily means. Regenerate only with a new versioned reference.\n// Source response and hash are retained in app/data/hydrology/.\nexport const HYDROLOGY_REFERENCE = Object.freeze(' +
    JSON.stringify(data, null, 2) +
    ');\n'
);
console.log(
  JSON.stringify({
    ok: true,
    id: data.id,
    sha256: data.sha256,
    observations: data.observations,
    sourceUrl,
  })
);
