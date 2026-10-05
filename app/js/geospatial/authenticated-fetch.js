export function createAuthenticatedDataFetch({fetchImpl=(...args)=>globalThis.fetch(...args),getToken=async()=>{const {getFirebaseAppCheckToken}=await import('../../../js/firebase-init.js?v=58');return getFirebaseAppCheckToken();}}={}){
 return async function fetchAuthenticatedData(url,{signal,...options}={}){
  const origin=globalThis.location?.origin||'http://localhost', target=new URL(url,origin);
  if((target.origin!==origin)||!['/api/geospatial/search','/api/geospatial/reverse','/api/geospatial/weather','/api/geospatial/marine'].includes(target.pathname))throw new TypeError('Authenticated data requests require the application gateway.');
  if(signal?.aborted)throw new DOMException('Data request cancelled','AbortError');
  let abort;const cancellation=new Promise((_,reject)=>{abort=()=>reject(signal?.reason||new DOMException('Data request cancelled','AbortError'));signal?.addEventListener('abort',abort,{once:true});});
  try{return await Promise.race([(async()=>{const token=await getToken();if(signal?.aborted)throw new DOMException('Data request cancelled','AbortError');const headers=new Headers(options.headers);if(token)headers.set('X-Firebase-AppCheck',token);return fetchImpl(url,{...options,signal,headers,credentials:'same-origin'});})(),cancellation]);}
  finally{signal?.removeEventListener('abort',abort);}
 };
}
export const fetchAuthenticatedData=createAuthenticatedDataFetch();
