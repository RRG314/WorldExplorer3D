export function createBoatPromptUi({ appCtx, getSeaStateConfig, getWaveIntensity, waterKindLabel }) {
  let prompt = null;
  let boatButton = null;
  let seaStateButton = null;
  let waveDock = null;
  let waveSlider = null;
  let waveLabel = null;
  let waveValue = null;
  let hideTimer = null;

  function ensureBoatPromptRefs() {
    if (!prompt) prompt = document.getElementById('boatPrompt');
    if (!boatButton) boatButton = document.getElementById('fBoat');
    if (!seaStateButton) seaStateButton = document.getElementById('fSeaState');
    if (!waveDock) waveDock = document.getElementById('boatWaveDock');
    if (!waveSlider) waveSlider = document.getElementById('boatWaveSlider');
    if (!waveLabel) waveLabel = document.getElementById('boatWaveLabel');
    if (!waveValue) waveValue = document.getElementById('boatWaveValue');
  }

  function boatHudLabel() {
    return `${waterKindLabel(appCtx.boatMode?.waterKind)} • ${getSeaStateConfig().label} Sea`;
  }

  function updateBoatMenuUi() {
    ensureBoatPromptRefs();
    if (boatButton) {
      const visible = !!(appCtx.boatMode?.active || appCtx.boatMode?.available || appCtx.oceanMode?.active);
      boatButton.style.display = visible ? '' : 'none';
      boatButton.textContent = appCtx.boatMode?.active ? '⛴ Exit Boat' : appCtx.oceanMode?.active ? '🚤 Surface Boat' : '🚤 Boat Mode';
      boatButton.classList.toggle('on', !!appCtx.boatMode?.active);
    }
    if (seaStateButton) {
      seaStateButton.style.display = appCtx.boatMode?.active ? '' : 'none';
      seaStateButton.textContent = `🌊 Sea State: ${getSeaStateConfig().label}`;
    }
    if (waveDock && waveSlider && waveLabel && waveValue) {
      const active = !!appCtx.boatMode?.active;
      waveDock.classList.toggle('show', active);
      waveDock.setAttribute('aria-hidden', active ? 'false' : 'true');
      const percent = Math.round(getWaveIntensity() * 100);
      if (document.activeElement !== waveSlider) waveSlider.value = String(percent);
      waveValue.textContent = `${percent}%`;
      waveLabel.textContent = `${getSeaStateConfig().label} Water`;
    }
  }

  function hideBoatPrompt() {
    ensureBoatPromptRefs();
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    if (!prompt) return;
    prompt.classList.remove('show');
    prompt.textContent = '';
    prompt.dataset.variant = '';
  }

  function showBoatPrompt(message, variant = 'supported', durationMs = 0) {
    ensureBoatPromptRefs();
    if (!prompt) return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    prompt.textContent = message;
    prompt.dataset.variant = variant;
    prompt.classList.add('show');
    if (Number.isFinite(durationMs) && durationMs > 0) {
      hideTimer = window.setTimeout(hideBoatPrompt, durationMs);
    }
  }

  function getWaveSlider() {
    ensureBoatPromptRefs();
    return waveSlider;
  }

  return { boatHudLabel, ensureBoatPromptRefs, getWaveSlider, hideBoatPrompt, showBoatPrompt, updateBoatMenuUi };
}
