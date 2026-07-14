import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
// ui.js - UI setup, event binding, button handlers
// ============================================================================
import { captureEarthWorldSession, resumeEarthWorldSession } from "./earth-session.js?v=2";
import { hidePlanetaryReturnControls } from "./planetary/entry.js?v=1";
import { initMapInteractions } from "./ui/map-interactions.js?v=59";
import { initMobileControls } from "./ui/mobile-controls.js?v=60";
import { initShareUi } from "./ui/share-links.js?v=60";
import { bindSpaceActions } from "./ui/space-actions.js?v=1";
import { initTitleScreenUi } from "./ui/title-screen.js?v=63";

function emitTutorialEvent(eventName, payload = {}) {
  if (typeof appCtx.tutorialOnEvent === 'function') {
    appCtx.tutorialOnEvent(eventName, payload);
  }
}

function setupUI() {
  const LAST_LOCATION_STORAGE_KEY = 'worldExplorer3D.lastLocation.v1';
  const bindTouchFriendlyPress = (el, handler) => {
    if (!el || typeof handler !== 'function') return;
    let suppressNextClick = false;
    const run = (event) => handler(event);

    el.addEventListener('pointerup', (event) => {
      if (!event || event.pointerType === 'mouse') return;
      suppressNextClick = true;
      run(event);
    });

    el.addEventListener('click', (event) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        if (event?.cancelable) event.preventDefault();
        return;
      }
      run(event);
    });
  };

  // Initialize Property UI References
  appCtx.PropertyUI.panel = document.getElementById('propertyPanel');
  appCtx.PropertyUI.list = document.getElementById('propertyList');
  appCtx.PropertyUI.modal = document.getElementById('propertyModal');
  appCtx.PropertyUI.modalTitle = document.getElementById('modalTitle');
  appCtx.PropertyUI.modalBody = document.getElementById('modalBody');
  appCtx.PropertyUI.button = document.getElementById('realEstateBtn');

  // Real Estate Button
  if (appCtx.PropertyUI.button) {
    appCtx.PropertyUI.button.addEventListener('click', appCtx.toggleRealEstate);
  }

  // Historic Sites Button
  const historicBtn = document.getElementById('historicBtn');
  if (historicBtn) {
    historicBtn.addEventListener('click', appCtx.toggleHistoric);
  }
  if (typeof appCtx.setupMemoryUI === 'function') {
    appCtx.setupMemoryUI();
  }
  if (typeof appCtx.setupFlowerChallenge === 'function') {
    appCtx.setupFlowerChallenge();
  }

  // Property Controls
  const radiusSlider = document.getElementById('radiusSlider');
  const radiusValue = document.getElementById('radiusValue');
  const sortSelect = document.getElementById('sortSelect');
  const refreshBtn = document.getElementById('refreshProperties');
  const clearFilterBtn = document.getElementById('clearPropertyFilter');

  if (radiusSlider && radiusValue) {
    radiusSlider.addEventListener('input', (e) => {
      appCtx.propertyRadius = parseFloat(e.target.value);
      radiusValue.textContent = appCtx.propertyRadius.toFixed(1) + ' km';
      if (appCtx.realEstateMode) appCtx.updatePropertyPanel();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      appCtx.propertySort = e.target.value;
      if (appCtx.realEstateMode) appCtx.updatePropertyPanel();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (appCtx.realEstateMode) appCtx.loadPropertiesAtCurrentLocation();
    });
  }

  // Property type filter buttons
  const propertyTypeButtons = document.querySelectorAll('.property-type-btn');

  propertyTypeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Remove active class from all buttons
      propertyTypeButtons.forEach((b) => {
        b.style.background = '#e2e8f0';
        b.style.color = '#64748b';
        b.classList.remove('active');
      });

      // Add active class to clicked button
      btn.style.background = '#667eea';
      btn.style.color = '#ffffff';
      btn.classList.add('active');

      appCtx.propertyTypeFilter = btn.dataset.type;

      // Update the panel
      if (appCtx.realEstateMode) appCtx.updatePropertyPanel();
    });
  });

  if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', appCtx.clearNavigation);
  }

  // Settings Tab - API Keys
  const rentcastKeyInput = document.getElementById('rentcastKeyInput');
  const attomKeyInput = document.getElementById('attomKeyInput');
  const estatedKeyInput = document.getElementById('estatedKeyInput');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const realEstateToggle = document.getElementById('realEstateToggle');
  const toggleLabel = document.getElementById('realEstateToggleLabel');
  const perfModeSelect = document.getElementById('perfModeSelect');
  const perfOverlayToggle = document.getElementById('perfOverlayToggle');
  const renderQualitySelect = document.getElementById('renderQualitySelect');
  const highQualityToggle = document.getElementById('highQualityToggle');
  const ssaoToggle = document.getElementById('ssaoToggle');
  const perfApplyReload = document.getElementById('perfApplyReload');
  const perfCopySnapshot = document.getElementById('perfCopySnapshot');
  const perfSettingsStatus = document.getElementById('perfSettingsStatus');
  const rdtNoiseToggle = document.getElementById('rdtNoiseToggle');
  const rdtNoiseVariantSelect = document.getElementById('rdtNoiseVariantSelect');
  const rdtNoiseStatus = document.getElementById('rdtNoiseStatus');
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

  // Performance benchmark controls (RDT vs baseline)
  if (perfModeSelect) {
    const currentMode = typeof appCtx.getPerfMode === 'function' ? appCtx.getPerfMode() : appCtx.perfMode || 'rdt';
    perfModeSelect.value = currentMode === 'baseline' ? 'baseline' : 'rdt';
  }
  if (perfOverlayToggle) {
    const overlayEnabled = typeof appCtx.getPerfOverlayEnabled === 'function' ?
    appCtx.getPerfOverlayEnabled() :
    !!appCtx.perfOverlayEnabled;
    perfOverlayToggle.checked = overlayEnabled;
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
  const getRdtNoiseConfig = () => {
    if (typeof appCtx.getRdtNoiseConfig === 'function') return appCtx.getRdtNoiseConfig();
    return {
      enabled: !!appCtx.rdtNoiseEnabled,
      variant: String(appCtx.rdtNoiseVariant || 'standard'),
      chaos: Number.isFinite(Number(appCtx.rdtNoiseChaos)) ? Number(appCtx.rdtNoiseChaos) : 0
    };
  };
  const syncRdtNoiseUi = () => {
    const cfg = getRdtNoiseConfig();
    if (rdtNoiseToggle) rdtNoiseToggle.checked = !!cfg.enabled;
    if (rdtNoiseVariantSelect) rdtNoiseVariantSelect.value = String(cfg.variant || 'standard');
    const rdtNoiseFloatItem = document.getElementById('fRdtNoise');
    if (rdtNoiseFloatItem) rdtNoiseFloatItem.classList.toggle('on', !!cfg.enabled);
    if (rdtNoiseStatus) {
      rdtNoiseStatus.textContent = cfg.enabled ?
      `Active (${String(cfg.variant || 'standard')})` :
      'Disabled';
    }
  };
  const applyRdtNoiseConfig = async ({ enabled = null, variant = null, source = 'settings' } = {}) => {
    const initial = getRdtNoiseConfig();
    const nextEnabled = enabled == null ? !!initial.enabled : !!enabled;
    const nextVariant = variant == null ? String(initial.variant || 'standard') : String(variant || 'standard');
    if (typeof appCtx.setRdtNoiseEnabled === 'function') appCtx.setRdtNoiseEnabled(nextEnabled);
    if (typeof appCtx.setRdtNoiseVariant === 'function') appCtx.setRdtNoiseVariant(nextVariant);
    syncRdtNoiseUi();
    if (perfSettingsStatus) {
      const sourceLabel = source === 'float' ? 'from Environment menu' : 'from Settings';
      perfSettingsStatus.textContent = appCtx.gameStarted ?
      `Applying RDT noise ${sourceLabel} and reloading world...` :
      `Saved RDT noise ${sourceLabel}. It will apply when you start.`;
    }
    if (appCtx.gameStarted && typeof appCtx.loadRoads === 'function') {
      await appCtx.loadRoads();
      if (perfSettingsStatus) {
        perfSettingsStatus.textContent = `RDT noise ${nextEnabled ? 'enabled' : 'disabled'} (${nextVariant}) and world reloaded.`;
      }
    }
    if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
  };
  syncRdtNoiseUi();

  const {
    clearVirtualHeldInputs,
    controlsTab,
    ctrlContent,
    ctrlHeader,
    isTouchPreferredClient,
    updateControlsModeUI
  } = initMobileControls();
  let shareUi = null;
  const titleUi = initTitleScreenUi({
    lastLocationStorageKey: LAST_LOCATION_STORAGE_KEY,
    perfModeSelect,
    shareExperienceStatus,
    perfSettingsStatus,
    gameShareFloatBtn,
    closeGameShareMenu: () => shareUi?.closeGameShareMenu?.(),
    applySharedRuntimeState: () => shareUi?.applySharedRuntimeState?.(),
    updateControlsModeUI,
    isTouchPreferredClient
  });
  const setTitleLaunchMode = typeof titleUi.setTitleLaunchMode === 'function' ? titleUi.setTitleLaunchMode : null;
  shareUi = initShareUi({
    bindTouchFriendlyPress,
    closeAllFloatMenus,
    getTitleLaunchMode: titleUi.getTitleLaunchMode
  });
  initMapInteractions();

  if (perfModeSelect) {
    perfModeSelect.addEventListener('change', (e) => {
      const selectedMode = e.target.value === 'baseline' ? 'baseline' : 'rdt';
      if (typeof appCtx.setPerfMode === 'function') appCtx.setPerfMode(selectedMode);
      if (perfSettingsStatus) {
        perfSettingsStatus.textContent = selectedMode === 'baseline' ?
        'Baseline selected. Use Apply + Reload World to rebuild with baseline budgets.' :
        'RDT selected. Use Apply + Reload World to rebuild with adaptive budgets.';
      }
      if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
    });
  }

  if (rdtNoiseToggle) {
    rdtNoiseToggle.addEventListener('change', async (e) => {
      const cfg = getRdtNoiseConfig();
      await applyRdtNoiseConfig({
        enabled: !!e.target.checked,
        variant: cfg.variant,
        source: 'settings'
      });
    });
  }

  if (rdtNoiseVariantSelect) {
    rdtNoiseVariantSelect.addEventListener('change', async (e) => {
      const cfg = getRdtNoiseConfig();
      await applyRdtNoiseConfig({
        enabled: cfg.enabled,
        variant: e.target.value,
        source: 'settings'
      });
    });
  }

  if (perfOverlayToggle) {
    perfOverlayToggle.addEventListener('change', (e) => {
      const enabled = !!e.target.checked;
      if (typeof appCtx.setPerfOverlayEnabled === 'function') appCtx.setPerfOverlayEnabled(enabled);
      if (perfSettingsStatus) {
        perfSettingsStatus.textContent = enabled ?
        'Live overlay enabled. Benchmark values will be shown during gameplay.' :
        'Live overlay disabled.';
      }
      if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
    });
  }

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

  if (perfApplyReload) {
    perfApplyReload.addEventListener('click', async () => {
      const selectedMode = perfModeSelect?.value === 'baseline' ? 'baseline' : 'rdt';
      if (typeof appCtx.setPerfMode === 'function') appCtx.setPerfMode(selectedMode);

      if (perfSettingsStatus) {
        perfSettingsStatus.textContent = appCtx.gameStarted ?
        `Applying ${selectedMode.toUpperCase()} mode and reloading world...` :
        `Saved ${selectedMode.toUpperCase()} mode. It will apply when you start.`;
      }

      if (appCtx.gameStarted && typeof appCtx.loadRoads === 'function') {
        await appCtx.loadRoads();
        if (perfSettingsStatus) {
          perfSettingsStatus.textContent = `${selectedMode.toUpperCase()} mode applied and world reloaded.`;
        }
      }
      if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
    });
  }

  if (perfCopySnapshot) {
    perfCopySnapshot.addEventListener('click', async () => {
      try {
        if (typeof appCtx.copyPerfSnapshotToClipboard !== 'function') {
          throw new Error('Snapshot exporter unavailable');
        }
        await appCtx.copyPerfSnapshotToClipboard();
        if (perfSettingsStatus) perfSettingsStatus.textContent = 'Benchmark snapshot copied to clipboard.';
      } catch (err) {
        if (perfSettingsStatus) {
          perfSettingsStatus.textContent = `Unable to copy snapshot: ${err?.message || err}`;
        }
      }
    });
  }

  function closeGameShareMenu() {
    shareUi?.closeGameShareMenu?.();
  }

  // Helper function to close all float menus
  function closeAllFloatMenus() {
    document.querySelectorAll('.floatMenu').forEach((m) => m.classList.remove('open'));
    closeGameShareMenu();
    if (typeof appCtx.toggleFlowerActionMenu === 'function') {
      const menuEl = document.getElementById('flowerActionMenu');
      if (menuEl && menuEl.classList.contains('open')) appCtx.toggleFlowerActionMenu();
    }
  }
  function goToMainMenu() {
    emitTutorialEvent('opened_main_menu', { source: 'main_menu_button' });
    hidePlanetaryReturnControls();
    appCtx.gameStarted = false;appCtx.paused = false;appCtx.clearObjectives();appCtx.clearPolice();appCtx.policeOn = false;appCtx.eraseTrack();appCtx.closePropertyPanel();appCtx.closeHistoricPanel();appCtx.clearPropertyMarkers();appCtx.realEstateMode = false;appCtx.historicMode = false;
    if (typeof appCtx.closeActivityBrowser === 'function') appCtx.closeActivityBrowser();
    if (typeof appCtx.stopBoatMode === 'function' && appCtx.boatMode?.active) appCtx.stopBoatMode({ targetMode: 'walk' });
    if (typeof appCtx.stopOceanMode === 'function' && appCtx.oceanMode && appCtx.oceanMode.active) appCtx.stopOceanMode();
    if (typeof appCtx.stopFlowerChallenge === 'function') appCtx.stopFlowerChallenge();
    if (typeof appCtx.setBuildModeEnabled === 'function') appCtx.setBuildModeEnabled(false);
    document.querySelectorAll('.floatMenu').forEach((m) => m.classList.remove('open'));
    setTitleLaunchMode?.('earth');
    document.getElementById('titleScreen').classList.remove('hidden');
    if (typeof appCtx.closeFlowerChallengeTitlePanel === 'function') appCtx.closeFlowerChallengeTitlePanel();
    ['hud', 'minimap', 'minimapZoomControls', 'police', 'floatMenuContainer', 'mainMenuBtn', 'pauseScreen', 'resultScreen', 'caughtScreen', 'controlsTab', 'coords', 'flowerChallengeHud', 'paintTownHud', 'realEstateBtn', 'historicBtn', 'memoryFlowerFloatBtn', 'gameShareFloatBtn', 'gameShareMenu', 'mobileTouchControls'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('show');
    });
    const flowerActionMenu = document.getElementById('flowerActionMenu');
    if (flowerActionMenu) flowerActionMenu.classList.remove('open');
    document.getElementById('boatPrompt')?.classList.remove('show');
    clearVirtualHeldInputs();
    if (ctrlContent) ctrlContent.classList.add('hidden');
    if (typeof appCtx.closeMemoryComposer === 'function') appCtx.closeMemoryComposer();
    const memoryInfoPanel = document.getElementById('memoryInfoPanel');
    if (memoryInfoPanel) memoryInfoPanel.classList.remove('show');
    updateControlsModeUI();
    if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
    if (typeof appCtx.refreshFlowerLeaderboard === 'function') appCtx.refreshFlowerLeaderboard();
  }

  // Float menu
  const FLOAT_MENU_BY_BUTTON = {
    travelBtn: 'travelMenu',
    realEstateFloatBtn: 'realEstateMenu',
    exploreBtn: 'exploreMenu',
    gameBtn: 'gameMenu',
    multiplayerBtn: 'multiplayerMenu'
  };

  const toggleFloatMenuByButton = (buttonId) => {
    const menuId = FLOAT_MENU_BY_BUTTON[buttonId];
    if (!menuId) return;
    const menu = document.getElementById(menuId);
    if (!menu) return;
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.floatMenu').forEach((m) => m.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
  };

  const floatMenuContainer = document.getElementById('floatMenuContainer');
  if (floatMenuContainer && isTouchPreferredClient) {
    floatMenuContainer.addEventListener('touchend', (event) => {
      if (!appCtx.gameStarted) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const menuBtn = target.closest('.floatBtn');
      if (menuBtn && menuBtn.id) {
        event.preventDefault();
        event.stopPropagation();
        toggleFloatMenuByButton(menuBtn.id);
        return;
      }

      const menuItem = target.closest('.floatItem');
      if (menuItem) {
        event.preventDefault();
        event.stopPropagation();
        menuItem.click();
      }
    }, { passive: false });
  }

  // Three separate float menu buttons
  document.getElementById('travelBtn').addEventListener('click', () => toggleFloatMenuByButton('travelBtn'));
  document.getElementById('realEstateFloatBtn').addEventListener('click', () => toggleFloatMenuByButton('realEstateFloatBtn'));
  document.getElementById('exploreBtn').addEventListener('click', () => toggleFloatMenuByButton('exploreBtn'));
  document.getElementById('gameBtn').addEventListener('click', () => toggleFloatMenuByButton('gameBtn'));
  const multiplayerBtn = document.getElementById('multiplayerBtn');
  if (multiplayerBtn) {
    multiplayerBtn.addEventListener('click', () => {
      primeMultiplayerUi();
      toggleFloatMenuByButton('multiplayerBtn');
    });
  }

  const homeMenuItem = document.getElementById('fHome');
  if (homeMenuItem) homeMenuItem.addEventListener('click', goToMainMenu);
  document.getElementById('fEditorMode')?.addEventListener('click', () => {
    if (typeof appCtx.closeActivityBrowser === 'function') appCtx.closeActivityBrowser();
    if (typeof appCtx.openBlockBuilder === 'function') appCtx.openBlockBuilder();
    closeAllFloatMenus();
  });
  document.getElementById('fEditorMine')?.addEventListener('click', () => {
    if (typeof appCtx.closeActivityBrowser === 'function') appCtx.closeActivityBrowser();
    if (typeof appCtx.openEditorSession === 'function') {
      appCtx.openEditorSession({ initialTab: 'mine', skipTutorial: true });
    } else if (typeof appCtx.toggleEditorSession === 'function') {
      appCtx.toggleEditorSession();
    }
    closeAllFloatMenus();
  });
  document.getElementById('fModerationPanel')?.addEventListener('click', () => {
    if (typeof appCtx.closeActivityBrowser === 'function') appCtx.closeActivityBrowser();
    if (typeof appCtx.openEditorSession === 'function') {
      appCtx.openEditorSession({ initialTab: 'moderation', skipTutorial: true });
    }
    closeAllFloatMenus();
  });
  document.getElementById('fActivityCreator')?.addEventListener('click', () => {
    if (typeof appCtx.closeActivityBrowser === 'function') appCtx.closeActivityBrowser();
    if (typeof appCtx.toggleActivityCreator === 'function') {
      appCtx.toggleActivityCreator();
    } else if (typeof appCtx.openActivityCreator === 'function') {
      appCtx.openActivityCreator();
    }
    closeAllFloatMenus();
  });
  document.getElementById('fActivities')?.addEventListener('click', () => {
    if (typeof appCtx.openActivityBrowser === 'function') {
      appCtx.openActivityBrowser({ scope: 'all' });
    } else if (typeof appCtx.toggleActivityBrowser === 'function') {
      appCtx.toggleActivityBrowser({ scope: 'all' });
    }
    closeAllFloatMenus();
  });
  document.getElementById('fRoomGames')?.addEventListener('click', () => {
    if (typeof appCtx.openActivityBrowser === 'function') {
      appCtx.openActivityBrowser({ scope: 'rooms' });
    } else if (typeof appCtx.toggleActivityBrowser === 'function') {
      appCtx.toggleActivityBrowser({ scope: 'rooms' });
    }
    closeAllFloatMenus();
  });
  const memoryFlowerFloatBtn = document.getElementById('memoryFlowerFloatBtn');
  if (memoryFlowerFloatBtn) {
    bindTouchFriendlyPress(memoryFlowerFloatBtn, () => {
      document.querySelectorAll('.floatMenu').forEach((m) => m.classList.remove('open'));
      closeGameShareMenu();
      if (typeof appCtx.toggleFlowerActionMenu === 'function') appCtx.toggleFlowerActionMenu();
      else if (typeof appCtx.openMemoryComposer === 'function') appCtx.openMemoryComposer('flower');
    });
  }
  document.getElementById('fSatellite').addEventListener('click', () => {
    appCtx.satelliteView = !appCtx.satelliteView;
    document.getElementById('fSatellite').classList.toggle('on', appCtx.satelliteView);
    document.getElementById('mapSatelliteToggle').classList.toggle('active', appCtx.satelliteView);
    closeAllFloatMenus();
  });
  document.getElementById('fRoads').addEventListener('click', () => {
    appCtx.showRoads = !appCtx.showRoads;
    document.getElementById('fRoads').classList.toggle('on', appCtx.showRoads);
    document.getElementById('mapRoadsToggle').classList.toggle('active', appCtx.showRoads);
    closeAllFloatMenus();
  });
  document.getElementById('fPaths').addEventListener('click', () => {
    appCtx.showPathOverlays = !appCtx.showPathOverlays;
    document.getElementById('fPaths').classList.toggle('on', appCtx.showPathOverlays);
    document.getElementById('mapPathsToggle').classList.toggle('active', appCtx.showPathOverlays);
    if (typeof appCtx.syncLinearFeatureOverlayVisibility === 'function') {
      appCtx.syncLinearFeatureOverlayVisibility();
    }
    closeAllFloatMenus();
  });
  document.getElementById('fLandUse').addEventListener('click', () => {
    appCtx.landUseVisible = !appCtx.landUseVisible;
    document.getElementById('fLandUse').classList.toggle('on', appCtx.landUseVisible);
    document.getElementById('fLandUseRE').classList.toggle('on', appCtx.landUseVisible);
    // Keep water features visible even when general land-use overlay is off.
    appCtx.landuseMeshes.forEach((m) => {
      const alwaysVisible = !!(m && m.userData && m.userData.alwaysVisible);
      m.visible = appCtx.landUseVisible || alwaysVisible;
    });
    closeAllFloatMenus();
  });
  document.getElementById('fLandUseRE').addEventListener('click', () => {
    appCtx.landUseVisible = !appCtx.landUseVisible;
    document.getElementById('fLandUse').classList.toggle('on', appCtx.landUseVisible);
    document.getElementById('fLandUseRE').classList.toggle('on', appCtx.landUseVisible);
    // Keep water features visible even when general land-use overlay is off.
    appCtx.landuseMeshes.forEach((m) => {
      const alwaysVisible = !!(m && m.userData && m.userData.alwaysVisible);
      m.visible = appCtx.landUseVisible || alwaysVisible;
    });
    closeAllFloatMenus();
  });
  const rdtNoiseFloatItem = document.getElementById('fRdtNoise');
  if (rdtNoiseFloatItem) {
    rdtNoiseFloatItem.addEventListener('click', async () => {
      const cfg = getRdtNoiseConfig();
      await applyRdtNoiseConfig({
        enabled: !cfg.enabled,
        variant: cfg.variant,
        source: 'float'
      });
      closeAllFloatMenus();
    });
  }
  document.getElementById('fTimeOfDay').addEventListener('click', () => {
    if (typeof appCtx.cycleTimeOfDay === 'function') appCtx.cycleTimeOfDay();
    closeAllFloatMenus();
  });
  const weatherModeItem = document.getElementById('fWeatherMode');
  if (weatherModeItem) {
    weatherModeItem.addEventListener('click', () => {
      if (typeof appCtx.cycleWeatherMode === 'function') appCtx.cycleWeatherMode();
      closeAllFloatMenus();
    });
  }
  const seaStateItem = document.getElementById('fSeaState');
  if (seaStateItem) {
    seaStateItem.addEventListener('click', () => {
      if (typeof appCtx.cycleBoatSeaState === 'function') appCtx.cycleBoatSeaState();
      closeAllFloatMenus();
    });
  }
  document.getElementById('fPolice').addEventListener('click', () => {
    appCtx.policeOn = !appCtx.policeOn;
    document.getElementById('fPolice').classList.toggle('on', appCtx.policeOn);
    document.getElementById('police').classList.toggle('show', appCtx.policeOn);
    if (appCtx.policeOn) appCtx.spawnPolice();else appCtx.clearPolice();
    closeAllFloatMenus();
  });
  // Travel mode switchers - mutually exclusive
  document.getElementById('fDriving').addEventListener('click', () => {
    if (typeof appCtx.setTravelMode === 'function') {
      appCtx.setTravelMode('drive', { source: 'ui_button' });
    } else {
      appCtx.droneMode = false;
      if (appCtx.Walk) appCtx.Walk.setModeDrive();
      emitTutorialEvent('mode_switched', { mode: 'drive', source: 'ui_button' });
    }
    updateControlsModeUI();
    closeAllFloatMenus();
  });

  document.getElementById('fWalk').addEventListener('click', () => {
    if (typeof appCtx.setTravelMode === 'function') {
      appCtx.setTravelMode('walk', { source: 'ui_button' });
    } else if (appCtx.Walk) {
      if (appCtx.Walk.state.mode !== 'walk') appCtx.Walk.toggleWalk();
      emitTutorialEvent('mode_switched', {
        mode: appCtx.Walk?.state?.mode === 'walk' ? 'walk' : 'drive',
        source: 'ui_button'
      });
    }
    updateControlsModeUI();
    closeAllFloatMenus();
  });

  document.getElementById('fDrone').addEventListener('click', () => {
    if (typeof appCtx.setTravelMode === 'function') {
      appCtx.setTravelMode('drone', { source: 'ui_button' });
    } else {
      appCtx.droneMode = true;
      emitTutorialEvent('mode_switched', { mode: 'drone', source: 'ui_button' });
    }
    updateControlsModeUI();
    closeAllFloatMenus();
  });

  document.getElementById('fBoat')?.addEventListener('click', () => {
    if (typeof appCtx.handleBoatAction === 'function') {
      appCtx.handleBoatAction();
    } else if (typeof appCtx.toggleBoatMode === 'function') {
      appCtx.toggleBoatMode({ source: 'ui_button' });
    }
    updateControlsModeUI();
    closeAllFloatMenus();
  });

  const oceanModeMenuItem = document.getElementById('fOceanMode');
  const earthModeMenuItem = document.getElementById('fEarthMode');

  const switchToOceanMode = async () => {
    if (appCtx.oceanMode && appCtx.oceanMode.active) return;
    if (appCtx.onMoon || (appCtx.spaceFlight && appCtx.spaceFlight.active) || appCtx.travelingToMoon) {
      closeAllFloatMenus();
      return;
    }
    if (appCtx.boatMode?.active && typeof appCtx.transferBoatToSubmarine === 'function') {
      await appCtx.transferBoatToSubmarine({ source: 'ui_ocean_mode' });
      updateControlsModeUI();
      return;
    }
    if (typeof appCtx.stopBoatMode === 'function' && appCtx.boatMode?.active) {
      appCtx.stopBoatMode({ targetMode: 'walk' });
    }
    captureEarthWorldSession();
    if (typeof appCtx.showTransitionLoad === 'function') {
      await appCtx.showTransitionLoad('ocean', 900);
    }
    if (typeof appCtx.startOceanMode === 'function') {
      appCtx.startOceanMode();
    }
    updateControlsModeUI();
  };

  const switchToEarthMode = async () => {
    const comingFromOcean = !!(appCtx.oceanMode && appCtx.oceanMode.active);
    if (comingFromOcean && typeof appCtx.stopOceanMode === 'function') {
      appCtx.stopOceanMode();
    }

    if (comingFromOcean) {
      await resumeEarthWorldSession({
        transitionDurationMs: 700
      });
    } else if (typeof appCtx.switchEnv === 'function' && appCtx.ENV && appCtx.ENV.EARTH) {
      appCtx.switchEnv(appCtx.ENV.EARTH);
    }

    updateControlsModeUI();
  };

  if (oceanModeMenuItem) {
    oceanModeMenuItem.addEventListener('click', async () => {
      await switchToOceanMode();
      closeAllFloatMenus();
    });
  }
  if (earthModeMenuItem) {
    earthModeMenuItem.addEventListener('click', async () => {
      await switchToEarthMode();
      closeAllFloatMenus();
    });
  }

  bindSpaceActions(appCtx, closeAllFloatMenus);
  document.getElementById('fRealEstate').addEventListener('click', () => {
    appCtx.toggleRealEstate();
    document.getElementById('fRealEstate').classList.toggle('on', appCtx.realEstateMode);
    closeAllFloatMenus();
  });
  document.getElementById('fHistoric').addEventListener('click', () => {
    appCtx.toggleHistoric();
    document.getElementById('fHistoric').classList.toggle('on', appCtx.historicMode);
    closeAllFloatMenus();
  });
  document.getElementById('fPOI').addEventListener('click', () => {
    appCtx.poiMode = !appCtx.poiMode;
    document.getElementById('fPOI').classList.toggle('on', appCtx.poiMode);
    appCtx.poiMeshes.forEach((m) => {
      if (m) m.visible = !!appCtx.poiMode;
    });
    if (!appCtx.poiMode) {
      const poiInfo = document.getElementById('poiInfo');
      if (poiInfo) poiInfo.style.display = 'none';
    }
    closeAllFloatMenus();
  });
  document.getElementById('fRespawn').addEventListener('click', () => {appCtx.spawnOnRoad();closeAllFloatMenus();});
  document.getElementById('fRespawnRand').addEventListener('click', () => {
    if (typeof appCtx.spawnOnRoad === 'function') appCtx.spawnOnRoad({ random: true });
    closeAllFloatMenus();
  });
  document.getElementById('fTrack').addEventListener('click', () => {appCtx.toggleTrackRecording();closeAllFloatMenus();});
  document.getElementById('fEraseTrack').addEventListener('click', () => {appCtx.eraseTrack();closeAllFloatMenus();});
  document.getElementById('fClouds').addEventListener('click', () => {
    appCtx.cloudsVisible = !appCtx.cloudsVisible;
    if (appCtx.cloudGroup) appCtx.cloudGroup.visible = appCtx.cloudsVisible;
    document.getElementById('fClouds').classList.toggle('on', !appCtx.cloudsVisible);
    if (typeof appCtx.applyWeatherPresentation === 'function') appCtx.applyWeatherPresentation();
    closeAllFloatMenus();
  });
  document.getElementById('fConstellations').addEventListener('click', () => {
    appCtx.constellationsVisible = !appCtx.constellationsVisible;
    if (appCtx.allConstellationLines) appCtx.allConstellationLines.visible = appCtx.constellationsVisible;
    document.getElementById('fConstellations').classList.toggle('on', appCtx.constellationsVisible);
    closeAllFloatMenus();
  });
  if (ctrlHeader && ctrlContent) {
    ctrlHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      ctrlContent.classList.toggle('hidden');
      updateControlsModeUI();
    });
  }

  // Main Menu Button
  document.getElementById('mainMenuBtn').addEventListener('click', () => {
    goToMainMenu();
  });

  // Close float menus when clicking outside
  document.addEventListener('click', (e) => {
    if (!appCtx.gameStarted) return;

    // Check if click is outside float menu container
    const floatContainer = document.getElementById('floatMenuContainer');
    const mainMenuBtn = document.getElementById('mainMenuBtn');
    const memoryFlowerBtn = document.getElementById('memoryFlowerFloatBtn');
    const flowerActionMenu = document.getElementById('flowerActionMenu');
    const gameShareBtn = document.getElementById('gameShareFloatBtn');
    const gameShareMenuEl = document.getElementById('gameShareMenu');
    const target = e.target instanceof Element ? e.target : null;
    const isFloatControlClick = !!(
      target &&
      (
      target.closest('#memoryFlowerFloatBtn') ||
      target.closest('#flowerActionMenu') ||
      target.closest('#gameShareFloatBtn') ||
      target.closest('#gameShareMenu'))
    );

    if (
      !isFloatControlClick &&
      floatContainer &&
      !floatContainer.contains(e.target) &&
      e.target !== mainMenuBtn &&
      (!memoryFlowerBtn || !memoryFlowerBtn.contains(e.target)) &&
      (!flowerActionMenu || !flowerActionMenu.contains(e.target)) &&
      (!gameShareBtn || !gameShareBtn.contains(e.target)) &&
      (!gameShareMenuEl || !gameShareMenuEl.contains(e.target)))
    {
      closeAllFloatMenus();
    }
    if (controlsTab && !controlsTab.contains(e.target) && ctrlContent) {
      ctrlContent.classList.add('hidden');
      updateControlsModeUI();
    }
  });

  document.getElementById('resumeBtn').addEventListener('click', () => {appCtx.paused = false;document.getElementById('pauseScreen').classList.remove('show');});
  document.getElementById('restartBtn').addEventListener('click', () => {appCtx.paused = false;document.getElementById('pauseScreen').classList.remove('show');appCtx.startMode();});
  document.getElementById('menuBtn').addEventListener('click', () => goToMainMenu());
  document.getElementById('caughtBtn').addEventListener('click', () => {document.getElementById('caughtScreen').classList.remove('show');appCtx.policeHits = 0;appCtx.paused = false;document.getElementById('police').textContent = '💔 0/3';appCtx.spawnOnRoad();});
  document.getElementById('againBtn').addEventListener('click', () => {appCtx.hideResult();appCtx.paused = false;appCtx.startMode();});
  document.getElementById('freeBtn').addEventListener('click', () => {
    appCtx.hideResult();
    appCtx.paused = false;
    appCtx.gameMode = 'free';
    appCtx.disableNearBuildingBatching = false;
    appCtx.clearObjectives();
  });
  document.getElementById('resMenuBtn').addEventListener('click', () => {appCtx.hideResult();goToMainMenu();});

}

// Entry point - initialize the application
Object.assign(appCtx, { setupUI });

export { setupUI };
