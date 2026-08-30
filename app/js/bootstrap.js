// ES module bootstrap: modular loader + legacy app compatibility.
import {
  classicScripts,
  moduleEntrypoint,
  vendorScriptsCritical,
  vendorScriptsOptional
} from './modules/manifest.js?v=548';
import { loadScriptList } from './modules/script-loader.js?v=56';
import {
  initStartupDiagnostics,
  recordStartupDiagnostic,
  showStartupDiagnostics,
  summarizeStartupError
} from './startup-diagnostics.js?v=2';

initStartupDiagnostics();
recordStartupDiagnostic('bootstrap', 'bootstrap script loaded');

if (!globalThis.__worldExplorerBootstrapErrorProbe) {
  globalThis.__worldExplorerBootstrapErrorProbe = true;
  globalThis.addEventListener('error', (event) => {
    recordStartupDiagnostic('window.error', event?.message || 'window error', {
      filename: event?.filename || null,
      lineno: event?.lineno || null,
      colno: event?.colno || null,
      errorName: event?.error?.name || null,
      errorMessage: event?.error?.message || null
    });
    console.error(
      '[bootstrap] window.error:',
      JSON.stringify({
        message: event?.message || null,
        filename: event?.filename || null,
        lineno: event?.lineno || null,
        colno: event?.colno || null,
        errorName: event?.error?.name || null,
        errorMessage: event?.error?.message || null
      })
    );
  });
  globalThis.addEventListener('unhandledrejection', (event) => {
    recordStartupDiagnostic('unhandledrejection', 'unhandled promise rejection', {
      reason: event?.reason?.message || formatReason(event?.reason)
    });
  });
}

function formatReason(reason) {
  if (!reason) return null;
  if (typeof reason === 'string') return reason;
  return reason?.stack || reason?.message || String(reason);
}

function scheduleBootstrapIdle(task, timeout = 2400) {
  const run = () => Promise.resolve().then(task).catch((error) => {
    console.warn('[bootstrap] Deferred boot task failed:', error);
  });
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(run, { timeout: Math.max(250, Number(timeout) || 2400) });
  } else {
    globalThis.setTimeout(run, 32);
  }
}

async function boot() {
  try {
    recordStartupDiagnostic('bootstrap', 'loading critical vendor scripts');
    const [coreThreeScript, ...dependentVendorScripts] = vendorScriptsCritical;
    if (coreThreeScript) {
      await loadScriptList([coreThreeScript], { timeoutMs: 12000 });
    }
    if (dependentVendorScripts.length > 0) {
      await loadScriptList(dependentVendorScripts, { timeoutMs: 12000, parallel: true });
    }
    recordStartupDiagnostic('bootstrap', 'critical vendor scripts ready', {
      hasTHREE: !!globalThis.THREE,
      hasRGBELoader: !!globalThis.THREE?.RGBELoader,
      hasDRACOLoader: !!globalThis.THREE?.DRACOLoader,
      hasGLTFLoader: !!globalThis.THREE?.GLTFLoader
    });
    console.log(
      '[bootstrap] critical vendor state:',
      JSON.stringify({
        hasTHREE: !!globalThis.THREE,
        hasRGBELoader: !!globalThis.THREE?.RGBELoader,
        hasDRACOLoader: !!globalThis.THREE?.DRACOLoader,
        hasGLTFLoader: !!globalThis.THREE?.GLTFLoader
      })
    );
    const resolvedClassicScripts = classicScripts.map(
      (relativePath) => new URL(relativePath, import.meta.url).toString()
    );
    recordStartupDiagnostic('bootstrap', 'loading classic scripts', { count: resolvedClassicScripts.length });
    await loadScriptList(resolvedClassicScripts, { timeoutMs: 12000 });

    const configuredEntrypoint = String(
      globalThis.__WORLD_EXPLORER_PRODUCTION__?.appEntrypoint || ''
    );
    const entrypoint = new URL(
      configuredEntrypoint || moduleEntrypoint,
      import.meta.url
    ).toString();
    recordStartupDiagnostic('bootstrap', 'importing module entrypoint', { entrypoint });
    const appModule = await import(entrypoint);
    const appApi = typeof appModule.bootApp === 'function'
      ? appModule.bootApp()
      : appModule;
    recordStartupDiagnostic('bootstrap', 'entrypoint booted', { entrypoint });
    console.log('[bootstrap] World Explorer loaded through ES module entrypoint:', entrypoint);

    if (vendorScriptsOptional.length > 0) {
      // These scripts change the active renderer when they finish. Starting
      // their network and parse work only after the first playable frame made
      // initial Earth play freeze and then visually switch pipelines. Begin
      // them while the title/globe is idle so normal world assembly overlaps
      // the work and the first playable frame uses the settled visual path.
      scheduleBootstrapIdle(() =>
        loadScriptList(vendorScriptsOptional, { timeoutMs: 10000, parallel: true })
        .then(() => {
          recordStartupDiagnostic('bootstrap', 'optional rendering scripts ready');
          if (typeof appApi?.tryEnablePostProcessing === 'function') {
            appApi.tryEnablePostProcessing();
          }
        })
        .catch((err) => {
          recordStartupDiagnostic('bootstrap', 'optional rendering scripts failed', summarizeStartupError(err));
          console.warn('[bootstrap] Optional rendering scripts not fully available:', err);
          if (typeof appApi?.tryEnablePostProcessing === 'function') {
            appApi.tryEnablePostProcessing();
          }
        }), 2400);
    }
  } catch (error) {
    recordStartupDiagnostic('bootstrap', 'fatal load error', summarizeStartupError(error));
    console.error('[bootstrap] Fatal load error:', error);
    console.error(
      '[bootstrap] Fatal load diagnostics:',
      JSON.stringify({
        name: error?.name || null,
        message: error?.message || null,
        stack: error?.stack || null,
        cause: error?.cause || null
      })
    );
    const loadingText = document.getElementById('loadText');
    if (loadingText) {
      loadingText.textContent = 'Failed to load scripts. Check console for details.';
    }
    const loading = document.getElementById('loading');
    if (loading) {
      loading.classList.add('show');
    }
    showStartupDiagnostics('Startup failed before the app booted');
  }
}

boot();
