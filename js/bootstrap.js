const CACHE_BUST = 'v=54';

function normalizeRepoBase(pathname = '/') {
  const path = String(pathname || '/');
  const jsMarker = '/js/';
  const appMarker = '/app';

  if (path.includes(jsMarker)) {
    return path.slice(0, path.indexOf(jsMarker));
  }

  if (path.includes(appMarker)) {
    return path.slice(0, path.indexOf(appMarker));
  }

  const trimmed = path.replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed;
}

function redirectToApp() {
  const base = normalizeRepoBase(window.location.pathname);
  const target = `${base}/app/${window.location.search || ''}${window.location.hash || ''}`;
  window.location.replace(target);
}

function bootCompat() {
  const pathname = String(window.location.pathname || '/');

  if (/\/app$/.test(pathname)) {
    window.location.replace(`${pathname}/${window.location.search || ''}${window.location.hash || ''}`);
    return;
  }

  if (!/\/app(?:\/|$)/.test(pathname)) {
    redirectToApp();
    return;
  }

  const entry = new URL(`../app/js/bootstrap.js?${CACHE_BUST}`, import.meta.url).toString();
  import(entry);
}

bootCompat();
