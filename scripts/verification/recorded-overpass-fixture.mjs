import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {publicProviderFixtureRequest} from './provider-fixture-key.mjs';

// Recorded map input isolates backend room/lease behavior from public-provider
// availability. Replay the exact captured map query and explicitly control the
// optional title-city suggestion query for that same location. Otherwise a
// live suggestion failure can put the provider into cooldown before the map
// fixture is reached. Other locations/queries retain their ordinary behavior.
// This is never installed in the shipped app; live-provider gates stay separate.
export async function installRecordedOverpassFixture(context, profile) {
  assert.ok(['desktop', 'mobile'].includes(profile));
  const base = new URL(`../../tests/fixtures/multiplayer/logan-primary-${profile}`, import.meta.url);
  const meta = JSON.parse(await readFile(new URL(`${base.href}.meta.json`), 'utf8'));
  const body = gunzipSync(await readFile(new URL(`${base.href}.json.gz`)));
  assert.equal(createHash('sha256').update(body).digest('hex'), meta.sha256, 'Recorded map bytes changed');
  const data = JSON.parse(body);
  assert.ok(!data.remark && data.elements?.some(e => e.type === 'way' && e.tags?.highway), 'Recorded map must be complete');
  const expected = publicProviderFixtureRequest({method:'POST', url:meta.endpoint, body:meta.query}).key[1];
  const nearbyQuery = `[out:json][timeout:8];node(around:160934,${meta.location.lat.toFixed(5)},${meta.location.lon.toFixed(5)})["place"="city"]["name"];out body 80;`;
  const nearbyExpected = publicProviderFixtureRequest({method:'POST', url:meta.endpoint, body:nearbyQuery}).key[1];
  const receipt = {profile, sha256:meta.sha256, sourceTimestamp:meta.sourceTimestamp, recordedAt:meta.recordedAt,
    hits:0, nearbyCities:{mode:'controlled-empty', hits:0},
    evidenceScope:'recorded primary map; controlled-empty nearby-city suggestions; not live-provider availability'};
  await context.route('**/api/interpreter*', async route => {
    const request = route.request();
    const candidate = publicProviderFixtureRequest({method:request.method(),url:request.url(),body:request.postData() || ''});
    if (!candidate.semanticOverpass) return route.continue();
    if (candidate.key[1] === nearbyExpected) {
      receipt.nearbyCities.hits++;
      return route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*','cache-control':'no-store'},
        body:JSON.stringify({version:0.6,generator:'World Explorer verification: controlled empty city suggestions',elements:[]})});
    }
    if (candidate.key[1] !== expected) return route.continue();
    receipt.hits++;
    return route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*','cache-control':'no-store'},body});
  });
  return receipt;
}
