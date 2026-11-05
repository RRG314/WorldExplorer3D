import { readFirebaseConfig } from '../../../js/firebase-config.js';
import { geospatialGatewayTarget } from './gateway-route.js';
function retryDelay(ms,signal){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(signal.reason||new DOMException('Data request cancelled','AbortError'));return;}
    const finish=()=>{signal?.removeEventListener('abort',cancel);resolve();};
    const timer=setTimeout(finish,ms);
    const cancel=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(signal.reason||new DOMException('Data request cancelled','AbortError'));};
    signal?.addEventListener('abort',cancel,{once:true});
  });
}
export function createAuthenticatedDataFetch({
  fetchImpl = (...args) => globalThis.fetch(...args),
  getToken = async () => {
    const { getFirebaseAppCheckToken } = await import('../../../js/firebase-init.js?v=58');
    return getFirebaseAppCheckToken();
  },
  resolveTarget = (url) =>
    geospatialGatewayTarget(url, {
      config: readFirebaseConfig(),
      emulators: globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS,
    }),
  waitImpl = retryDelay,
} = {}) {
  return async function fetchAuthenticatedData(url, { signal, ...options } = {}) {
    const origin = globalThis.location?.origin || 'http://localhost',
      target = new URL(url, origin);
    if (
      target.origin !== origin ||
      ![
        '/api/geospatial/search',
        '/api/geospatial/reverse',
        '/api/geospatial/weather',
        '/api/geospatial/marine',
      ].includes(target.pathname)
    )
      throw new TypeError('Authenticated data requests require the application gateway.');
    if (signal?.aborted) throw new DOMException('Data request cancelled', 'AbortError');
    let abort;
    const cancellation = new Promise((_, reject) => {
      abort = () =>
        reject(signal?.reason || new DOMException('Data request cancelled', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
    });
    try {
      return await Promise.race([
        (async () => {
          const destination = resolveTarget(url);
          const token = await getToken();
          if (signal?.aborted) throw new DOMException('Data request cancelled', 'AbortError');
          const headers = new Headers(options.headers);
          if (token) headers.set('X-Firebase-AppCheck', token);
          const requestOptions = {
            ...options,
            signal,
            headers,
            credentials: new URL(destination, origin).origin === origin ? 'same-origin' : 'omit',
          };
          for(let attempt=0;attempt<3;attempt++){
            const response=await fetchImpl(destination,requestOptions);
            if(signal?.aborted)throw signal.reason||new DOMException('Data request cancelled','AbortError');
            if(response.status!==429||attempt===2||String(options.method||'GET').toUpperCase()!=='GET')return response;
            const seconds=Number(response.headers.get('Retry-After')||2);
            if(!Number.isFinite(seconds)||seconds<0||seconds>4)return response;
            await response.body?.cancel();
            await waitImpl(Math.max(250,seconds*1000),signal);
          }
        })(),
        cancellation,
      ]);
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  };
}
export const fetchAuthenticatedData = createAuthenticatedDataFetch();
