import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const server = await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4290, 4291, 4292, 4293]
});
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}/app/js/earth-core/provider-outage-circuit.js`, {
    waitUntil: 'domcontentloaded'
  });
  const result = await page.evaluate(async () => {
    const originalFetch = globalThis.fetch;
    let providerCalls = 0;
    globalThis.fetch = async (url, options) => {
      if (String(url).includes('titiler.terrascope.be')) {
        providerCalls += 1;
        if (options?.signal?.aborted) throw options.signal.reason;
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(
            options.signal.reason || new DOMException('fixture request aborted', 'AbortError')
          ), { once: true });
        });
      }
      return originalFetch(url, options);
    };
    try {
      const { loadWorldCoverBaseline, worldCoverProviderSnapshot } =
        await import('/app/js/terrain/worldcover-baseline.js?v=15');
      const startedAt = performance.now();
      const requests = Array.from({ length: 50 }, (_, index) => loadWorldCoverBaseline({
        latS: 39.20 + index * 0.0001,
        latN: 39.21 + index * 0.0001,
        lonW: -76.70,
        lonE: -76.69
      }, { key: `outage-fixture:${index}`, size: 32, timeoutMs: 50 }));
      const settled = await Promise.allSettled(requests);
      return {
        elapsedMs: performance.now() - startedAt,
        providerCalls,
        rejected: settled.filter((entry) => entry.status === 'rejected').length,
        providerUnavailable: settled.filter((entry) => (
          entry.status === 'rejected' && entry.reason?.code === 'provider_unavailable'
        )).length,
        circuit: worldCoverProviderSnapshot()
      };
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  assert.equal(result.rejected, 50, 'The outage fixture unexpectedly produced land-cover results.');
  assert.ok(result.providerCalls <= 6,
    `WorldCover drained its full failed queue instead of stopping at the in-flight budget: ${JSON.stringify(result)}`);
  assert.equal(result.providerUnavailable, 50, 'Queued WorldCover requests did not receive the classified outage.');
  assert.equal(result.circuit.open, true, 'WorldCover did not enter its bounded outage state.');
  assert.ok(result.circuit.abortedSiblingRequests >= 1, 'Timed-out WorldCover work did not cancel sibling requests.');
  assert.ok(result.elapsedMs < 2_000, `The classified outage did not settle promptly: ${result.elapsedMs} ms`);

  console.log(JSON.stringify({ ok: true, contract: 'worldcover-outage-browser', ...result }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
