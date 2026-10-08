import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {installRecordedOverpassFixture} from '../scripts/verification/recorded-overpass-fixture.mjs';

test('controlled city suggestions cannot replace or count as the recorded primary map', async () => {
  let handler;
  const receipt = await installRecordedOverpassFixture({route: async (_pattern, run) => {handler = run;}}, 'desktop');
  const meta = JSON.parse(await readFile(new URL('./fixtures/multiplayer/logan-primary-desktop.meta.json', import.meta.url), 'utf8'));
  const run = async (query, url = meta.endpoint) => {
    let response, continued = false;
    await handler({request: () => ({method: () => 'POST', url: () => url, postData: () => 'data=' + encodeURIComponent(query)}),
      fulfill: async value => {response = value;}, continue: async () => {continued = true;}});
    return {response, continued};
  };
  const nearby = '[out:json][timeout:8];node(around:160934,41.73533,-111.83491)["place"="city"]["name"];out body 80;';
  const suggestions = await run(nearby);
  assert.deepEqual(JSON.parse(suggestions.response.body).elements, []);
  assert.equal(receipt.nearbyCities.mode, 'controlled-empty');
  assert.equal(receipt.nearbyCities.hits, 1); assert.equal(receipt.hits, 0);
  const primary = await run(meta.query);
  assert.equal(createHash('sha256').update(primary.response.body).digest('hex'), meta.sha256);
  assert.equal(receipt.hits, 1);
  for (const [query, url] of [[nearby.replace('41.73533', '40.00000'), meta.endpoint],
    [nearby.replace('160934', '1000'), meta.endpoint], [nearby, 'https://example.test/api/interpreter'],
    [meta.query.replace('out body', 'out tags'), meta.endpoint]]) {
    const result = await run(query, url);
    assert.equal(result.continued, true); assert.equal(result.response, undefined);
  }
  assert.equal(receipt.hits, 1); assert.equal(receipt.nearbyCities.hits, 1);
});
