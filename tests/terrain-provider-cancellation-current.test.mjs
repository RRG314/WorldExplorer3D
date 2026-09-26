import test from 'node:test';
import assert from 'node:assert/strict';
import { isExpectedTerrainProviderCancellation as canceled } from '../scripts/verification/terrain-provider-cancellation.mjs';
const worldCover='https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/-76.8603515625,39.63107677008366,-76.849365234375,39.639537564366705/128x128.npy?collection=esa-worldcover&item=ESA_WorldCover_10m_2021_v200_N39W078&assets=map';

test('bounded terrain provider cancellation is distinct from a network failure', () => {
  for (const url of [worldCover,'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/1170/1552.png','https://vector.openstreetmap.org/shortbread_v1/13/2346/3112.mvt','https://marine-api.open-meteo.com/v1/marine?latitude=39']) {
    assert.equal(canceled(url,'net::ERR_ABORTED'),true);
    for (const reason of ['net::ERR_FAILED','net::ERR_CONNECTION_RESET','HTTP 404','']) assert.equal(canceled(url,reason),false);
  }
});

test('unrelated resources and similar provider URLs cannot bypass error acceptance', () => {
  for (const url of ['http://127.0.0.1:4481/app/js/app-entry.js','https://tile.openstreetmap.org/14/4707/6242.png',
    'https://s3.amazonaws.com/unrelated/terrarium/12/1170/1552.png',
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/1170/1552.js',
    'https://example.test/elevation-tiles-prod/terrarium/12/1170/1552.png',
    worldCover.replace('planetarycomputer.microsoft.com','example.test'),worldCover.replace('esa-worldcover','other'),
    worldCover.replace('assets=map','assets=unknown'),worldCover.replace('https:','http:'),'not a URL']) {
    assert.equal(canceled(url,'net::ERR_ABORTED'),false,url);
  }
});
