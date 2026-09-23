import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {publicProviderFixtureRequest} from './provider-fixture-key.mjs';

// Recorded map input isolates backend room/lease behavior from public-provider
// availability. Only the exact captured query is replayed; all other requests
// retain their ordinary behavior. This is never installed in the shipped app.
export async function installRecordedOverpassFixture(context, profile) {
  assert.ok(['desktop', 'mobile'].includes(profile));
  const base = new URL(`../../tests/fixtures/multiplayer/logan-primary-${profile}`, import.meta.url);
  const meta = JSON.parse(await readFile(new URL(`${base.href}.meta.json`), 'utf8'));
  const body = gunzipSync(await readFile(new URL(`${base.href}.json.gz`)));
  assert.equal(createHash('sha256').update(body).digest('hex'), meta.sha256, 'Recorded map bytes changed');
  const data = JSON.parse(body);
  assert.ok(!data.remark && data.elements?.some(e => e.type === 'way' && e.tags?.highway), 'Recorded map must be complete');
  const expected = publicProviderFixtureRequest({method:'POST', url:meta.endpoint, body:meta.query}).key[1];
  const receipt = {profile, sha256:meta.sha256, sourceTimestamp:meta.sourceTimestamp, recordedAt:meta.recordedAt,
    hits:0, evidenceScope:'recorded public map input; not live-provider availability'};
  await context.route('**/api/interpreter*', async route => {
    const request = route.request();
    const candidate = publicProviderFixtureRequest({method:request.method(),url:request.url(),body:request.postData() || ''});
    if (!candidate.semanticOverpass || candidate.key[1] !== expected) return route.continue();
    receipt.hits++;
    return route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*','cache-control':'no-store'},body});
  });
  return receipt;
}
