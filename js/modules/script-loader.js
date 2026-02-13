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

    if (existing && existing.dataset?.loaded !== 'true') {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error(`Failed to load script: ${src}`)),
        { once: true }
      );
      return;
    }

    let timeoutId = null;
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.loaded = 'false';
    script.onload = () => {
      if (timeoutId) clearTimeout(timeoutId);
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(new Error(`Failed to load script: ${src}`));
    };

    timeoutId = setTimeout(() => {
      reject(new Error(`Script load timeout (${timeoutMs}ms): ${src}`));
    }, timeoutMs);

    document.head.appendChild(script);
  });

  const trackedPromise = loadPromise.finally(() => {
    inFlightClassicScripts.delete(src);
  });

  inFlightClassicScripts.set(src, trackedPromise);
  return trackedPromise;
}

export async function loadScriptList(sources, options = {}) {
  for (const src of sources) {
    await loadClassicScript(src, options);
  }
}
