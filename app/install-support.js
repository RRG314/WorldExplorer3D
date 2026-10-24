// Only navigation recovery is installed. Game assets, APIs and private data keep
// their existing owners and network/cache policies.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/app/offline-worker.js', {scope:'/app/', updateViaCache:'none'})
      .catch(() => { /* Optional install support must never prevent gameplay. */ });
  }, {once:true});
}
