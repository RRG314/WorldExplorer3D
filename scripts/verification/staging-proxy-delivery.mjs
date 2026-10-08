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
