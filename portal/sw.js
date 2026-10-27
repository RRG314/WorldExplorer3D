// Scoped to /portal/. Cache static presentation only, never account/API replies.
const CACHE='we3d-living-portal-20261025-1',MAX_FILES=120;
function staticUrl(input){
  const url=new URL(input,self.location.href);
  return url.origin===self.location.origin&&(
    /^\/portal\/(?:index\.html|portal\.css)?$/.test(url.pathname)||
    /^\/styles\/(?:world-explorer-tokens|distribution)\.css$/.test(url.pathname)||
    /^\/(?:app\/js|js)\/[a-z0-9_./-]+\.js$/i.test(url.pathname)||
    /^\/runtime\/[a-f0-9]{24}\/(?:js\/[a-z0-9_./-]+\.js|app\/js\/shared-context\.js)$/i.test(url.pathname)||
    /^\/assets\/landing\/current\/[a-z0-9_.-]+\.(?:webp|png|jpg)$/i.test(url.pathname))?url:null;
}
async function remember(request,response){
  if(!response.ok||response.type!=='basic')return;
  const cache=await caches.open(CACHE);await cache.put(cacheKey(request),response.clone());
  const keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-MAX_FILES)))await cache.delete(key);
}
function cacheKey(request){
  const url=new URL(typeof request==='string'?request:request.url,self.location.href);
  if(/^\/portal\/(?:index\.html)?$/.test(url.pathname)){url.pathname='/portal/';url.search='';}
  return url.href;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);await cache.addAll(['./','./portal.css','../styles/world-explorer-tokens.css?v=3','../styles/distribution.css?v=1']);await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('we3d-living-portal-')&&name!==CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{
  if(event.data?.type!=='cache-portal-static'||!Array.isArray(event.data.urls)||
    !event.source?.url||new URL(event.source.url).origin!==self.location.origin||!new URL(event.source.url).pathname.startsWith('/portal/'))return;
  const urls=[...new Set(event.data.urls)].slice(0,MAX_FILES).map(staticUrl).filter(Boolean);
  event.waitUntil((async()=>{for(const url of urls){try{const response=await fetch(url.href,{credentials:'omit'});await remember(url.href,response);}catch{}}event.source.postMessage({type:'portal-offline-ready'});})());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!staticUrl(event.request.url))return;
  event.respondWith((async()=>{
    try{const response=await fetch(event.request);if(response.ok)event.waitUntil(remember(event.request,response));return response;}
    catch(error){const cached=await caches.match(cacheKey(event.request),{cacheName:CACHE});if(cached)return cached;throw error;}
  })());
});
