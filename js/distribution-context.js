/* Loaded before page content, and by the billing module. This is presentation
 * context, never an entitlement or an authentication decision. */
(() => {
  if (globalThis.WorldExplorerDistribution) return;
  const key = 'we3d:google-play-session';
  const current = new URL(globalThis.location.href);
  let isGooglePlay = current.searchParams.getAll('distribution').includes('google-play');
  try { isGooglePlay ||= globalThis.sessionStorage.getItem(key) === '1'; } catch {}
  try {
    const referrer = new URL(globalThis.document?.referrer || '');
    isGooglePlay ||= (referrer.protocol === 'android-app:' && referrer.hostname === 'io.worldexplorer3d.app') ||
      (referrer.origin === current.origin && referrer.searchParams.getAll('distribution').includes('google-play'));
  } catch {}
  if (isGooglePlay) {
    try { globalThis.sessionStorage.setItem(key, '1'); } catch {}
  }
  function url(href) {
    const target = new URL(href, globalThis.location.href);
    if (isGooglePlay && target.origin === current.origin && /^https?:$/.test(target.protocol)) {
      target.searchParams.set('distribution', 'google-play');
    }
    return target.href;
  }
  globalThis.WorldExplorerDistribution = Object.freeze({ isGooglePlay, url });
  const document = globalThis.document;
  if (!document) return;
  document.documentElement.dataset.distribution = isGooglePlay ? 'google-play' : 'web';
  if (isGooglePlay) {
    // Preserve context through reloads even when browser storage is unavailable.
    globalThis.history.replaceState(globalThis.history.state, '', url(current.href));
    const preserveLink = event => {
      const anchor = event.target.closest?.('a[href]');
      if (anchor && !anchor.hasAttribute('download')) anchor.href = url(anchor.href);
    };
    document.addEventListener('click', preserveLink, true);
    document.addEventListener('auxclick', preserveLink, true);
    // Include links opened with the browser's context menu, including new tabs.
    document.addEventListener('contextmenu', preserveLink, true);
  }
})();
