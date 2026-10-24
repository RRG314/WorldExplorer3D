import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';

const bootstrap = await fs.readFile(new URL('../js/distribution-context.js', import.meta.url), 'utf8');
const billingCode = await fs.readFile(new URL('../js/billing.js', import.meta.url), 'utf8');
const distributionCode = await fs.readFile(new URL('../js/distribution.js', import.meta.url), 'utf8');

function page({ href = 'https://worldexplorer3d.io/app/', storage = new Map(), referrer = '', storageFails = false } = {}) {
  const listeners = new Map(), historyCalls = [], redirects = [];
  const document = { referrer, documentElement: { dataset: {} }, addEventListener: (name, fn) => listeners.set(name, fn) };
  const context = vm.createContext({ URL, document, location: { href, assign: url => redirects.push(url) },
    sessionStorage: { getItem: key => { if (storageFails) throw Error('blocked'); return storage.get(key); },
      setItem: (key, value) => { if (storageFails) throw Error('blocked'); storage.set(key, value); } },
    history: { state: { existing: true }, replaceState: (...args) => historyCalls.push(args) } });
  vm.runInContext(bootstrap, context);
  return { context, distribution: context.WorldExplorerDistribution, listeners, historyCalls, storage, redirects };
}

async function billing(page) {
  const requests = [];
  const modules = new Map([
    ['context', new vm.SourceTextModule(bootstrap, { context: page.context })],
    ['distribution', new vm.SourceTextModule(distributionCode, { context: page.context })],
    ['api', new vm.SyntheticModule(['getReturnUrlBase', 'postProtectedFunction'], function () {
      this.setExport('getReturnUrlBase', () => 'https://worldexplorer3d.io');
      this.setExport('postProtectedFunction', async (...args) => { requests.push(args); return { url: 'https://checkout.example/session', overview: { plan: 'pro' }, receipts: [] }; });
    }, { context: page.context })]
  ]);
  const module = new vm.SourceTextModule(billingCode, { context: page.context });
  await module.link(specifier => modules.get(specifier.includes('function-api') ? 'api' : specifier.includes('distribution-context') ? 'context' : 'distribution'));
  await module.evaluate();
  return { api: module.namespace, requests };
}

test('ordinary web checkout and portal keep their protected API and redirect behavior', async () => {
  const p = page(), { api, requests } = await billing(p);
  assert.equal(p.distribution.isGooglePlay, false);
  assert.equal(p.historyCalls.length, 0);
  await api.redirectToCheckout('pro'); await api.redirectToPortal();
  assert.deepEqual(requests.map(r => r[0]), ['/createCheckoutSession', '/createPortalSession']);
  assert.equal(requests[0][1].plan, 'pro');
  assert.equal(p.redirects.length, 2);
});

test('Play checkout and portal reject before any network request; existing account reads still work', async () => {
  const p = page({ href: 'https://worldexplorer3d.io/app/?distribution=google-play' });
  const { api, requests } = await billing(p);
  for (const method of ['createCheckoutSession', 'createPortalSession', 'redirectToCheckout', 'redirectToPortal']) {
    await assert.rejects(api[method]('pro'), /Purchases are unavailable/);
  }
  assert.equal(requests.length, 0); assert.equal(p.redirects.length, 0);
  assert.equal((await api.getAccountOverview()).plan, 'pro');
  await api.listBillingReceipts();
  assert.deepEqual(requests.map(r => r[0]), ['/getAccountOverview', '/listBillingReceipts']);
});

test('Play context survives account navigation, reload and conflicting URL markers', () => {
  const first = page({ href: 'https://worldexplorer3d.io/app/?distribution=web&distribution=google-play&room=ABC123#join' });
  assert.equal(first.distribution.isGooglePlay, true);
  const target = new URL(first.distribution.url('../account/?section=security'));
  assert.equal(target.searchParams.get('section'), 'security');
  assert.equal(target.searchParams.get('distribution'), 'google-play');
  const next = page({ href: 'https://worldexplorer3d.io/account/?distribution=web', storage: first.storage });
  assert.equal(next.distribution.isGooglePlay, true);
  assert.deepEqual(new URL(first.historyCalls[0][2]).searchParams.getAll('distribution'), ['google-play']);
  assert.equal(new URL(first.historyCalls[0][2]).hash, '#join');
  assert.equal(first.historyCalls[0][0].existing, true);
});

test('storage denial still preserves Play context in URLs and same-origin navigation referrers', () => {
  const p = page({ href: 'https://worldexplorer3d.io/app/?distribution=google-play', storageFails: true });
  assert.equal(p.distribution.isGooglePlay, true);
  assert.match(p.historyCalls[0][2], /distribution=google-play/);
  assert.equal(page({ storageFails: true, referrer: p.distribution.url('../account/') }).distribution.isGooglePlay, true);
  assert.equal(page({ referrer: 'android-app://io.worldexplorer3d.app' }).distribution.isGooglePlay, true);
  assert.equal(page({ referrer: 'https://unrelated.example/?distribution=google-play' }).distribution.isGooglePlay, false);
});

test('dynamic links, new tabs and context-menu links retain context without changing external or download URLs', () => {
  const p = page({ href: 'https://worldexplorer3d.io/app/?distribution=google-play' });
  for (const name of ['click', 'auxclick', 'contextmenu']) {
    const anchor = { href: 'https://worldexplorer3d.io/account/?section=support#receipts', hasAttribute: () => false };
    p.listeners.get(name)({ target: { closest: () => anchor } });
    const target = new URL(anchor.href);
    assert.equal(target.searchParams.get('section'), 'support'); assert.equal(target.hash, '#receipts');
    assert.equal(target.searchParams.get('distribution'), 'google-play');
  }
  assert.equal(p.distribution.url('mailto:support@mail.worldexplorer3d.io'), 'mailto:support@mail.worldexplorer3d.io');
  assert.equal(p.distribution.url('https://other.example/'), 'https://other.example/');
  const download = { href: 'https://worldexplorer3d.io/photo.png', hasAttribute: () => true };
  p.listeners.get('click')({ target: { closest: () => download } });
  assert.equal(download.href, 'https://worldexplorer3d.io/photo.png');
});

test('installed app names agree with the saved Google Play listing', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../app/manifest.webmanifest', import.meta.url)));
  const strings = await fs.readFile(new URL('../android/app/src/main/res/values/strings.xml', import.meta.url), 'utf8');
  assert.equal(manifest.name, 'World Explorer 3D'); assert.equal(manifest.short_name, 'World Explorer 3D');
  assert.match(strings, /name="app_name">World Explorer 3D</);
});
