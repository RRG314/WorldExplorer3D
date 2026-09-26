// Opt-in timing evidence for the local source preview. Only phase labels and
// numeric counters are sent; no source payloads, account data or credentials.
export function emitLocalLoadTrace(scope,phase,details={}) {
  const page=globalThis.location;
  if(!page || !['localhost','127.0.0.1'].includes(page.hostname) || new URLSearchParams(page.search).get('worldLoadTrace')!=='1')return;
  const counters=Object.fromEntries(Object.entries({javascriptHeapBytes:globalThis.performance?.memory?.usedJSHeapSize,...details}).filter(([,value])=>typeof value==='number' && Number.isFinite(value)).slice(0,12));
  globalThis.navigator?.sendBeacon?.('/__preview/load-trace',JSON.stringify({scope,phase,counters,time:performance.now()}));
}
