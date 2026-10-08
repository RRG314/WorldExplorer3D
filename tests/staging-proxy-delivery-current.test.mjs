import test from 'node:test';
import assert from 'node:assert/strict';
import {fulfillStagingProxyRoute} from '../scripts/verification/staging-proxy-delivery.mjs';

test('successful upstream responses preserve their body/status; failed upstream fetches become a single gateway response', async () => {
  const upstream = {status: 429, body: 'provider limit'};
  for (const unavailable of [false, true]) {
    const delivered = [];
    await fulfillStagingProxyRoute({page: {isClosed: () => false}, target: 'https://example.test/provider', route: {
      fetch: async () => {if (unavailable) throw new Error('ECONNRESET'); return upstream;},
      fulfill: async options => delivered.push(options)
    }});
    assert.equal(delivered.length, 1);
    if (unavailable) assert.equal(delivered[0].status, 502);
    else assert.equal(delivered[0].response, upstream, 'Provider errors must not become successful synthetic responses');
  }
});

test('an in-flight page closure cannot attempt a second fulfillment or leak a teardown rejection', async () => {
  for (const closeDuring of ['fetch', 'fulfill']) {
    let closed = false, attempts = 0;
    await fulfillStagingProxyRoute({page: {isClosed: () => closed}, target: 'https://example.test/provider', route: {
      fetch: async () => {if (closeDuring === 'fetch') {closed = true; throw new Error('Target closed');} return {};},
      fulfill: async () => {attempts++; closed = true; throw new Error('Route is already handled!');}
    }});
    assert.equal(attempts, closeDuring === 'fetch' ? 0 : 1);
  }
});

test('unexplained route delivery failures remain fatal and never become a second gateway response', async () => {
  for (const upstreamFailed of [false, true]) {
    let attempts = 0;
    await assert.rejects(fulfillStagingProxyRoute({page: {isClosed: () => false}, target: 'https://example.test/provider', route: {
      fetch: async () => {if (upstreamFailed) throw Error('network'); return {};},
      fulfill: async () => {attempts++; throw Error('Route is already handled!');}
    }}), /Route is already handled/);
    assert.equal(attempts, 1);
  }
});

// Playwright can reject delivery before page.isClosed() reflects context close.
test('context closure may race the page closed flag without a second fulfillment', async () => {
  let attempts = 0;
  await fulfillStagingProxyRoute({page: {isClosed: () => false}, target: 'https://example.test/provider', route: {
    fetch: async () => ({}),
    fulfill: async () => {attempts++; throw Error('route.fulfill: Target page, context or browser has been closed');}
  }});
  assert.equal(attempts, 1);
});
