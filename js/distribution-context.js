/* Presentation context only; never an entitlement or authentication decision. */
(() => {
  if (globalThis.WorldExplorerDistribution) return;
  const current = new URL(globalThis.location.href);
  const known = ['google-play', 'app-store'];
  const fromURL = url => known.find(value => url.searchParams.getAll('distribution').includes(value));
  let edition = fromURL(current);
  // Retain the earlier Play session key so existing installed sessions stay restricted.
  try {
    if (globalThis.sessionStorage.getItem('we3d:google-play-session') === '1') edition = 'google-play';
    else if (!edition && known.includes(globalThis.sessionStorage.getItem('we3d:store-edition'))) edition = globalThis.sessionStorage.getItem('we3d:store-edition');
  } catch {}
  try {
    const referrer = new URL(globalThis.document?.referrer || '');
    if (referrer.protocol === 'android-app:' && referrer.hostname === 'io.worldexplorer3d.app') edition = 'google-play';
    else if (!edition && referrer.origin === current.origin) edition = fromURL(referrer);
  } catch {}
  if (edition) {
    try {
      globalThis.sessionStorage.setItem('we3d:store-edition', edition);
      if (edition === 'google-play') globalThis.sessionStorage.setItem('we3d:google-play-session', '1');
    } catch {}
  }
  function url(href) {
    const target = new URL(href, globalThis.location.href);
    if (edition && target.origin === current.origin && /^https?:$/.test(target.protocol)) target.searchParams.set('distribution', edition);
    return target.href;
  }
  globalThis.WorldExplorerDistribution = Object.freeze({ isGooglePlay: edition === 'google-play', isAppStore: edition === 'app-store', isStoreEdition: !!edition, url });
  const document = globalThis.document;
  if (!document) return;
  document.documentElement.dataset.distribution = edition || 'web';
  if (edition) {
    // URL context also survives navigation when session storage is unavailable.
    globalThis.history.replaceState(globalThis.history.state, '', url(current.href));
    const preserveLink = event => {
      const anchor = event.target.closest?.('a[href]');
      if (anchor && !anchor.hasAttribute('download')) anchor.href = url(anchor.href);
    };
    for (const name of ['click', 'auxclick', 'contextmenu']) document.addEventListener(name, preserveLink, true);
  }
})();
