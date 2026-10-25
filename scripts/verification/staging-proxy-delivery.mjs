// WebKit page routes cannot see requests from a service-worker-controlled page.
// Use the existing owned loopback server for these explicit staging gateways.
// Caller host/origin validation runs before this callback. No cookies or arbitrary
// destinations are forwarded; real staging App Check remains required upstream.
export function createStagingGatewayHandler({fetchImpl = globalThis.fetch} = {}) {
  const endpoints = new Map([
    ['/api/geospatial/search', 'getPlaceLookup'],
    ['/api/geospatial/reverse', 'getPlaceLookup'],
    ['/api/geospatial/weather', 'getEnvironmentalData'],
    ['/api/geospatial/marine', 'getEnvironmentalData'],
    ['/api/geospatial/aircraft', 'getAircraftStates']
  ]);
  return async (request, response, url) => {
    const endpoint = endpoints.get(url.pathname);
    if (!endpoint) return false;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET') { response.writeHead(405).end('{}'); return true; }
    const target = new URL(`https://us-central1-we3d-staging-20260712.cloudfunctions.net/${endpoint}`);
    target.search = url.search;
    try {
      const headers = request.headers['x-firebase-appcheck'] ? {'X-Firebase-AppCheck': request.headers['x-firebase-appcheck']} : {};
      const upstream = await fetchImpl(target, {headers, redirect: 'error', signal: AbortSignal.timeout(55000)});
      const parts = []; let size = 0;
      for await (const part of upstream.body || []) {
        size += part.length;
        if (size > 6000000) throw Error('Staging gateway response exceeds limit');
        parts.push(part);
      }
      const retry = upstream.headers.get('retry-after');
      if (retry) response.setHeader('Retry-After', retry);
      response.writeHead(upstream.status).end(Buffer.concat(parts));
    } catch {
      response.writeHead(502).end(JSON.stringify({error: 'Staging geospatial provider unavailable.'}));
    }
    return true;
  };
}

// Verification-only Hosting proxy. Upstream failure and delivery failure are
// separate: a route may have accepted fulfillment before teardown rejects it.
// A failed delivery must never result in a second terminal route action.
export async function fulfillStagingProxyRoute({page, route, target}) {
  let response;
  try { response = await route.fetch({url: target, timeout: 55_000}); }
  catch {
    if (page.isClosed()) return;
    await deliver({status: 502, contentType: 'application/json', body: JSON.stringify({error: 'Staging geospatial provider unavailable.'})});
    return;
  }
  await deliver({response});

  async function deliver(options) {
    if (page.isClosed()) return;
    try { await route.fulfill(options); }
    catch (error) {
      if (page.isClosed() || /Target (?:page, context or browser|closed)|has been closed/i.test(String(error?.message || error))) return;
      throw error;
    }
  }
}
