import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../js/function-api.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '')
  .replace("const DEFAULT_FUNCTIONS_REGION", "const getCurrentUserToken = async () => 'test-token'; const getFirebaseAppCheckToken = async () => 'test-check'; const readFirebaseConfig = () => ({projectId: 'test-project'}); const assertFunctionsOrigin = x => x;\nconst DEFAULT_FUNCTIONS_REGION");
const api = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
for (const method of ['postProtectedFunction', 'postAppCheckedFunction']) {
  test(`${method}: lost response after commit is not replayed`, async t => {
    let writes = 0;
    t.mock.method(globalThis, 'fetch', async () => { writes++; throw new TypeError('response lost'); });
    await assert.rejects(api[method]('/submitContribution'), e => e.outcomeUnknown === true);
    assert.equal(writes, 1);
  });
  test(`${method}: gateway failure and malformed success do not replay`, async t => {
    for (const status of [502, 503, 504, 200]) {
      let calls = 0;
      const mock = t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('<html>error</html>', {status}); });
      await assert.rejects(api[method]('/write'), e => e.outcomeUnknown === true);
      assert.equal(calls, 1); mock.mock.restore();
    }
  });
  test(`${method}: non-JSON missing route can reach configured function`, async t => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => ++calls === 1 ? new Response('Not found', {status:404}) : Response.json({ok:true}));
    assert.deepEqual(await api[method]('/write'), {ok:true}); assert.equal(calls, 2);
  });
  test(`${method}: pre-cancel sends nothing`, async t => {
    let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(api[method]('/write', {}, {signal:controller.signal}), e => e.code === 'request-cancelled' && !e.outcomeUnknown);
    assert.equal(calls, 0);
  });
  test(`${method}: deadline aborts stalled body delivery`, async t => {
    let signal;
    t.mock.method(globalThis, 'fetch', async (_url, init) => { signal = init.signal; return {text:() => new Promise(()=>{})}; });
    await assert.rejects(api[method]('/write', {}, {timeoutMs:10}), e => e.code === 'request-timeout' && e.outcomeUnknown);
    assert.equal(signal.aborted, true);
  });
  test(`${method}: cancellation reaches in-flight fetch`, async t => {
    const controller = new AbortController(); let signal;
    t.mock.method(globalThis, 'fetch', async (_url, init) => { signal = init.signal; controller.abort(); return new Promise(()=>{}); });
    await assert.rejects(api[method]('/write', {}, {signal:controller.signal}), e => e.code === 'request-cancelled' && e.outcomeUnknown);
    assert.equal(signal.aborted, true);
  });
  test(`${method}: server validation response is preserved without retry`, async t => {
    let calls=0; t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({error:'invalid'}, {status:400});});
    await assert.rejects(api[method]('/write'), e=>e.status===400 && e.payload.error==='invalid' && !e.outcomeUnknown);
    assert.equal(calls,1);
  });
}
