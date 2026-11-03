import test from 'node:test';
import assert from 'node:assert/strict';
import { botanyReportMarkup, botanyArchiveMarkup } from '../app/js/campaign/botany-report.js';
test('unrecognized retained plant-report shapes cannot break the shared Journal or become fabricated observations', () => {
  const report = {
    truthType: 'declared-season-plant-study',
    plants: { future: { schemaVersion: 9, opaque: true } },
    plotReadings: { future: { schemaVersion: 9 } },
    planting: { variety: 'a', cell: 0 },
    conclusion: '<script>untrusted</script>'
  };
  const markup = botanyReportMarkup(report);
  assert.ok(!markup.includes('<script>'));
  assert.ok(markup.includes('&lt;script&gt;'));
  assert.ok(!markup.includes('NaN'));
  assert.ok(!markup.includes('<h3>Plant FUTURE'));
  assert.equal(botanyReportMarkup({ ...report, planting: null }), '');
  assert.doesNotThrow(() =>
    botanyArchiveMarkup({
      site: { truthType: 'virtual-training-site', name: 'old plot' },
      runId: 'old-run',
      plants: { a: null },
      plotReadings: { visit: null }
    })
  );
});
