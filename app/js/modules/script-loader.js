const DEFAULT_SCRIPT_TIMEOUT_MS = 12000;
const inFlightClassicScripts = new Map();

export function loadClassicScript(src, options = {}) {
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_SCRIPT_TIMEOUT_MS;

  if (inFlightClassicScripts.has(src)) {
    return inFlightClassicScripts.get(src);
  }

  const loadPromise = new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find((s) => s.src === src);
    if (existing?.dataset?.loaded === 'true') {
      resolve();
      return;
    }

    const script = existing || document.createElement('script');
    let settled = false;
    let timeoutId;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      if (error) {
        script.remove();
        reject(error);
      } else {
        script.dataset.loaded = 'true';
        resolve();
      }
    };
    const onLoad = () => finish();
    const onError = () => finish(new Error(`Failed to load script: ${src}`));
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    timeoutId = setTimeout(() => finish(new Error(`Script load timeout (${timeoutMs}ms): ${src}`)), timeoutMs);
    if (!existing) {
      script.src = src;
      script.async = false;
      script.dataset.loaded = 'false';
      try { document.head.appendChild(script); } catch (error) { finish(error); }
    }

  });

  const trackedPromise = loadPromise.finally(() => {
    inFlightClassicScripts.delete(src);
  });

  inFlightClassicScripts.set(src, trackedPromise);
  return trackedPromise;
}

export async function loadScriptList(sources, options = {}) {
  if (options.parallel) {
    await Promise.all(sources.map((src) => loadClassicScript(src, options)));
    return;
  }
  for (const src of sources) {
    await loadClassicScript(src, options);
  }
}
