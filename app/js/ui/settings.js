export function setupSettingsUi(appCtx) {
  // Settings Tab - API Keys
  const rentcastKeyInput = document.getElementById('rentcastKeyInput');
  const attomKeyInput = document.getElementById('attomKeyInput');
  const estatedKeyInput = document.getElementById('estatedKeyInput');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const realEstateToggle = document.getElementById('realEstateToggle');
  const toggleLabel = document.getElementById('realEstateToggleLabel');
  const continuousWorldToggle = document.getElementById('continuousWorldToggle');
  const continuousWorldToggleLabel = document.getElementById('continuousWorldToggleLabel');
  const continuousWorldStatus = document.getElementById('continuousWorldStatus');
  const renderQualitySelect = document.getElementById('renderQualitySelect');
  const highQualityToggle = document.getElementById('highQualityToggle');
  const ssaoToggle = document.getElementById('ssaoToggle');
  const perfSettingsStatus = document.getElementById('perfSettingsStatus');
  const shareExperienceStatus = document.getElementById('shareExperienceStatus');
  const gameShareFloatBtn = document.getElementById('gameShareFloatBtn');
  const hudBox = document.getElementById('hudBox');
  const hudToggleBtn = document.getElementById('hudToggleBtn');

  const updateHudCompactState = (compact) => {
    if (!(hudBox instanceof HTMLElement)) return;
    const nextCompact = !!compact;
    hudBox.classList.toggle('compact', nextCompact);
    if (hudToggleBtn instanceof HTMLButtonElement) {
      hudToggleBtn.textContent = nextCompact ? 'HUD' : '-';
      hudToggleBtn.setAttribute('aria-expanded', nextCompact ? 'false' : 'true');
      hudToggleBtn.setAttribute('aria-label', nextCompact ? 'Expand HUD' : 'Collapse HUD');
    }
  };

  updateHudCompactState(false);
  if (hudToggleBtn instanceof HTMLButtonElement) {
    hudToggleBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateHudCompactState(!hudBox?.classList.contains('compact'));
    });
  }

  // Load saved API keys from localStorage
  const savedRentcast = localStorage.getItem('rentcastApiKey');
  const savedAttom = localStorage.getItem('attomApiKey');
  const savedEstated = localStorage.getItem('estatedApiKey');

  if (savedRentcast) {
    appCtx.apiConfig.rentcast = savedRentcast;
    if (rentcastKeyInput) rentcastKeyInput.value = savedRentcast;
  }
  if (savedAttom) {
    appCtx.apiConfig.attom = savedAttom;
    if (attomKeyInput) attomKeyInput.value = savedAttom;
  }
  if (savedEstated) {
    appCtx.apiConfig.estated = savedEstated;
    if (estatedKeyInput) estatedKeyInput.value = savedEstated;
  }

  // Load real estate mode preference
  const savedRealEstateMode = localStorage.getItem('realEstateEnabled');
  if (savedRealEstateMode === 'true') {
    if (realEstateToggle) realEstateToggle.checked = true;
    if (toggleLabel) toggleLabel.style.background = '#f0f4ff';
  }

  // Save API keys
  if (saveApiKeyBtn) {
    saveApiKeyBtn.addEventListener('click', () => {
      let savedCount = 0;

      // Save Estated
      if (estatedKeyInput) {
        const key = estatedKeyInput.value.trim();
        if (key) {
          appCtx.apiConfig.estated = key;
          localStorage.setItem('estatedApiKey', key);
          savedCount++;
        } else {
          appCtx.apiConfig.estated = null;
          localStorage.removeItem('estatedApiKey');
        }
      }

      // Save ATTOM
      if (attomKeyInput) {
        const key = attomKeyInput.value.trim();
        if (key) {
          appCtx.apiConfig.attom = key;
          localStorage.setItem('attomApiKey', key);
          savedCount++;
        } else {
          appCtx.apiConfig.attom = null;
          localStorage.removeItem('attomApiKey');
        }
      }

      // Save RentCast
      if (rentcastKeyInput) {
        const key = rentcastKeyInput.value.trim();
        if (key) {
          appCtx.apiConfig.rentcast = key;
          localStorage.setItem('rentcastApiKey', key);
          savedCount++;
        } else {
          appCtx.apiConfig.rentcast = null;
          localStorage.removeItem('rentcastApiKey');
        }
      }

      // Show feedback
      if (savedCount > 0) {
        saveApiKeyBtn.textContent = `✓ Saved ${savedCount} API Key${savedCount > 1 ? 's' : ''}!`;
        saveApiKeyBtn.style.background = '#10b981';
      } else {
        saveApiKeyBtn.textContent = '✓ All Keys Cleared!';
        saveApiKeyBtn.style.background = '#64748b';
      }

      setTimeout(() => {
        saveApiKeyBtn.textContent = '💾 Save All API Keys';
        saveApiKeyBtn.style.background = '#667eea';
      }, 2000);
    });
  }

  // Real estate toggle
  if (realEstateToggle && toggleLabel) {
    realEstateToggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('realEstateEnabled', enabled);
      toggleLabel.style.background = enabled ? '#f0f4ff' : '#f8fafc';
      toggleLabel.style.borderColor = enabled ? '#667eea' : '#e2e8f0';
    });
  }

  const syncContinuousWorldUi = () => {
    const enabled = typeof appCtx.getContinuousWorldEnabled === 'function' ?
      appCtx.getContinuousWorldEnabled() :
      !!appCtx.earthStreamingState?.enabled;
    if (continuousWorldToggle) continuousWorldToggle.checked = enabled;
    if (continuousWorldToggleLabel) {
      continuousWorldToggleLabel.style.background = enabled ? '#f0f4ff' : '#f8fafc';
      continuousWorldToggleLabel.style.borderColor = enabled ? '#667eea' : '#e2e8f0';
    }
    if (continuousWorldStatus) {
      continuousWorldStatus.textContent = enabled ?
        'Continuous World is active. New map areas load as you travel.' :
        'Quality Location mode is active.';
    }
  };
  syncContinuousWorldUi();
  if (continuousWorldToggle) {
    continuousWorldToggle.addEventListener('change', async () => {
      const enabled = !!continuousWorldToggle.checked;
      continuousWorldToggle.disabled = true;
      if (continuousWorldStatus) {
        continuousWorldStatus.textContent = enabled ?
          'Enabling continuous map loading...' :
          'Restoring the complete selected location...';
      }
      try {
        if (typeof appCtx.setContinuousWorldEnabled === 'function') {
          await appCtx.setContinuousWorldEnabled(enabled);
        }
      } finally {
        continuousWorldToggle.disabled = false;
        syncContinuousWorldUi();
      }
    });
  }

  const syncRenderQualityUi = () => {
    const currentLevel = typeof appCtx.getRenderQualityLevel === 'function' ?
    String(appCtx.getRenderQualityLevel() || 'med').toLowerCase() :
    String(appCtx.renderQualityLevel || 'med').toLowerCase();
    const normalizedLevel = currentLevel === 'low' || currentLevel === 'high' ? currentLevel : 'med';
    if (renderQualitySelect) renderQualitySelect.value = normalizedLevel;
    if (highQualityToggle) {
      const highEnabled = typeof appCtx.getHighQualityEnabled === 'function' ?
      !!appCtx.getHighQualityEnabled() :
      normalizedLevel === 'high';
      highQualityToggle.checked = highEnabled;
    }
    if (ssaoToggle) {
      const ssaoEnabled = typeof appCtx.getSsaoEnabled === 'function' ?
      !!appCtx.getSsaoEnabled() :
      !!appCtx.ssaoEnabled;
      ssaoToggle.checked = ssaoEnabled;
      const ssaoSupported = typeof appCtx.canUseSsao === 'function' ? !!appCtx.canUseSsao() : true;
      ssaoToggle.disabled = !ssaoSupported;
      ssaoToggle.title = ssaoSupported ?
      'Adds contact shadows when Render Quality is set to High.' :
      'SSAO disabled on low-end/mobile devices.';
    }
  };
  syncRenderQualityUi();

  if (renderQualitySelect) {
    renderQualitySelect.addEventListener('change', () => {
      const selected = renderQualitySelect.value === 'low' || renderQualitySelect.value === 'high' ?
      renderQualitySelect.value :
      'med';
      if (typeof appCtx.setRenderQualityLevel === 'function') appCtx.setRenderQualityLevel(selected);
      syncRenderQualityUi();
      if (perfSettingsStatus) {
        perfSettingsStatus.textContent = `Render quality set to ${selected.toUpperCase()}.`;
      }
      if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
    });
  }

  if (highQualityToggle) {
    highQualityToggle.addEventListener('change', () => {
      const enabled = !!highQualityToggle.checked;
      if (typeof appCtx.setHighQualityEnabled === 'function') {
        const current = renderQualitySelect?.value || 'med';
        const fallbackLevel = current === 'high' ? 'med' : current;
        appCtx.setHighQualityEnabled(enabled, { fallbackLevel });
      } else if (typeof appCtx.setRenderQualityLevel === 'function') {
        appCtx.setRenderQualityLevel(enabled ? 'high' : 'med');
      }
      syncRenderQualityUi();
      if (perfSettingsStatus) {
        perfSettingsStatus.textContent = enabled ?
        'High Quality Boost enabled.' :
        'High Quality Boost disabled.';
      }
      if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
    });
  }

  if (ssaoToggle) {
    ssaoToggle.addEventListener('change', () => {
      const wanted = !!ssaoToggle.checked;
      let enabled = wanted;
      if (typeof appCtx.setSsaoEnabled === 'function') {
        enabled = !!appCtx.setSsaoEnabled(wanted);
      } else {
        appCtx.ssaoEnabled = wanted;
      }
      syncRenderQualityUi();
      if (perfSettingsStatus) {
        if (wanted && !enabled) {
          perfSettingsStatus.textContent = 'SSAO unavailable on this device quality tier.';
        } else if (enabled) {
          const quality = typeof appCtx.getRenderQualityLevel === 'function' ?
          String(appCtx.getRenderQualityLevel() || 'med').toLowerCase() :
          String(appCtx.renderQualityLevel || 'med').toLowerCase();
          perfSettingsStatus.textContent = quality === 'high' ?
          'SSAO enabled (High quality).' :
          'SSAO armed and will apply on High quality.';
        } else {
          perfSettingsStatus.textContent = 'SSAO disabled.';
        }
      }
      if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
    });
  }


  return { gameShareFloatBtn, perfSettingsStatus, shareExperienceStatus };
}
