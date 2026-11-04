import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  validateBundle,
  prepareSummary,
  select,
  decode,
} from '../app/vendor/collision-lab/science.mjs';
import { boostPair } from '../app/vendor/collision-lab/models.mjs';

// Package compact witnesses for the fixed study cases. This uses the retained
// original calculation; it does not rerun the accepted scientific qualification.
const raw = await fs.readFile('app/assets/data/cms/dimuon-2010b.json'),
  manifest = JSON.parse(await fs.readFile('app/assets/data/cms/manifest.json')),
  hash = (value) => createHash('sha256').update(value).digest('hex');
assert.equal(hash(raw), manifest.sha256);
const bundle = validateBundle(JSON.parse(raw)),
  summary = prepareSummary(bundle),
  populations = {};
for (const cut of [20, 30]) {
  populations[cut] = {};
  for (const charge of ['all', 'opposite', 'same']) {
    const selection = select(summary, cut, charge);
    populations[cut][charge] = {
      count: selection.indices.length,
      bins: selection.bins,
      outsideHistogram: selection.outside,
      selectedRowsSha256: hash(JSON.stringify(selection.indices)),
    };
  }
}
const low = bundle.events.findIndex(
    (row, i) =>
      summary.mass[i] > 9 &&
      summary.mass[i] < 11 &&
      Math.abs(summary.mass[i] - row[12]) < 0.001 &&
      boostPair(decode(row, i).muons, 0).restBeta < 0.94
  ),
  second = bundle.events.findIndex(
    (row, i) =>
      i !== 34248 &&
      summary.opposite[i] &&
      summary.minPt[i] >= 30 &&
      summary.mass[i] > 80 &&
      summary.mass[i] < 100 &&
      boostPair(decode(row, i).muons, 0).restBeta < 0.94
  );
assert.ok(low >= 0 && second >= 0);
const witnesses = Object.fromEntries(
    [
      ['campaign', 34248],
      ['wider-bunch', low],
      ['selection-control', second],
    ].map(([id, index]) => [
      id,
      { ...decode(bundle.events[index], index), sourceRow: [...bundle.events[index]] },
    ])
  ),
  reference = {
    schemaVersion: 1,
    protocol: 'we3d-cms-study-reference-v1',
    bundleSha256: manifest.sha256,
    sourceSha256: bundle.sourceSha256,
    source: bundle.source,
    doi: bundle.doi,
    category: bundle.category,
    rows: bundle.count,
    sourceSelection: bundle.selection,
    populations,
    witnesses,
  };
await fs.writeFile(
  'app/js/campaign/cms-study-reference.js',
  '// Generated from the pinned recorded CMS bundle using the retained original science module.\nexport const CMS_STUDY_REFERENCE = Object.freeze(' +
    JSON.stringify(reference, null, 2) +
    ');\n'
);
console.log(
  JSON.stringify({
    scope: 'Compact fixed-study data packaging, not numerical requalification',
    rows: bundle.count,
    witnessRows: Object.values(witnesses).map((r) => r.row),
    cuts: Object.keys(populations),
    bundleSha256: manifest.sha256,
  })
);
