export function createPlaceLookupFetch({fetchImpl=(...args)=>globalThis.fetch(...args),getToken=async()=>{const {getFirebaseAppCheckToken}=await import('../../../js/firebase-init.js?v=58');return getFirebaseAppCheckToken();}}={}){
 return async function fetchPlaceLookup(url,{signal,...options}={}){
  if(signal?.aborted)throw new DOMException('Place lookup cancelled','AbortError');
  let abort;const cancellation=new Promise((_,reject)=>{abort=()=>reject(signal?.reason||new DOMException('Place lookup cancelled','AbortError'));signal?.addEventListener('abort',abort,{once:true});});
  try{return await Promise.race([(async()=>{const token=await getToken();if(signal?.aborted)throw new DOMException('Place lookup cancelled','AbortError');const headers=new Headers(options.headers);if(token)headers.set('X-Firebase-AppCheck',token);return fetchImpl(url,{...options,signal,headers,credentials:'same-origin'});})(),cancellation]);}
  finally{signal?.removeEventListener('abort',abort);}
 };
}
export const fetchPlaceLookup=createPlaceLookupFetch();
