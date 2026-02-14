// ES module bootstrap: modular loader + legacy app compatibility.
import {
  classicScripts,
  moduleEntrypoint,
  vendorScriptsCritical,
  vendorScriptsOptional
} from './modules/manifest.js?v=51';
import { loadScriptList } from './modules/script-loader.js?v=51';

async function boot() {
  try {
    await loadScriptList(vendorScriptsCritical, { timeoutMs: 12000 });
    const resolvedClassicScripts = classicScripts.map(
      (relativePath) => new URL(relativePath, import.meta.url).toString()
    );
    await loadScriptList(resolvedClassicScripts, { timeoutMs: 12000 });

    const entrypoint = new URL(moduleEntrypoint, import.meta.url).toString();
    const appModule = await import(entrypoint);
    const appApi = typeof appModule.bootApp === 'function'
      ? appModule.bootApp()
      : appModule;
    console.log('[bootstrap] World Explorer loaded through ES module entrypoint:', entrypoint);

    if (vendorScriptsOptional.length > 0) {
      loadScriptList(vendorScriptsOptional, { timeoutMs: 10000 })
        .then(() => {
          if (typeof appApi?.tryEnablePostProcessing === 'function') {
            appApi.tryEnablePostProcessing();
          }
        })
        .catch((err) => {
          console.warn('[bootstrap] Optional rendering scripts not fully available:', err);
          if (typeof appApi?.tryEnablePostProcessing === 'function') {
            appApi.tryEnablePostProcessing();
          }
        });
    }
  } catch (error) {
    console.error('[bootstrap] Fatal load error:', error);
    const loadingText = document.getElementById('loadText');
    if (loadingText) {
      loadingText.textContent = 'Failed to load scripts. Check console for details.';
    }
    const loading = document.getElementById('loading');
    if (loading) {
      loading.classList.add('show');
    }
  }
}

boot();
