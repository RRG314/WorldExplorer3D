import assert from 'node:assert/strict';

const baseUrl = String(process.env.WE3D_BASE_URL || process.argv[2] || '').replace(/\/$/, '');
assert(baseUrl, 'Set WE3D_BASE_URL or pass the deployed preview URL as the first argument.');

async function fetchJson(pathname, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    const body = await response.text();
    assert.equal(response.status, 200, `${pathname} returned HTTP ${response.status}: ${body.slice(0, 180)}`);
    assert.match(response.headers.get('content-type') || '', /application\/json/i, `${pathname} did not return JSON.`);
    return JSON.parse(body);
  } finally {
    clearTimeout(timeoutId);
  }
}

const aircraft = await fetchJson('/api/geospatial/aircraft?lat=39.29&lon=-76.61&radiusKm=160&limit=5');
assert.equal(aircraft.schemaVersion, 1, 'Aircraft response schema is not version 1.');
assert.equal(aircraft.provider, 'opensky', 'Aircraft response is not from OpenSky.');
assert(Array.isArray(aircraft.items), 'Aircraft response is missing its items array.');
assert(aircraft.bounds && Number.isFinite(aircraft.bounds.lamin), 'Aircraft response is missing query bounds.');

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  aircraft: {
    provider: aircraft.provider,
    observations: aircraft.items.length,
    fetchedAt: aircraft.fetchedAt,
    cache: aircraft.cache
  }
}, null, 2));
