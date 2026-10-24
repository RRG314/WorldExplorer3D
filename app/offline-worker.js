// Network only. No CacheStorage, precaching, queued writes or background work.
// API/data/module requests are never intercepted; successful navigation retains
// its original response, cookies and cache behavior.
const recovery = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#1a1a2e"><title>Connect to explore — World Explorer 3D</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#1a1a2e;color:#eef7f8;font:17px/1.6 system-ui,sans-serif}main{box-sizing:border-box;width:min(100%,34rem);padding:32px;text-align:center}h1{font-size:28px;line-height:1.2}button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:12px 22px;background:#53c4ff;color:#091728;cursor:pointer}button:focus-visible{outline:3px solid white;outline-offset:5px}</style><main><p>WORLD EXPLORER 3D</p><h1>Connect to explore</h1><p>The game could not connect. Check your internet connection and try again.</p><p>Reconnecting does not clear your saved progress.</p><button type="button" onclick="location.reload()">Try again</button></main></html>`;
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' ||
      url.origin !== self.location.origin || !url.pathname.startsWith('/app/')) return;
  const fallback = () => new Response(recovery, {status:200,
    headers:{'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-WE3D-Recovery':'offline'}});
  event.respondWith(fetch(request).then(response => response.status >= 500 ? fallback() : response).catch(fallback));
});
