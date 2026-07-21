const HUB_PANELS = {
  games: { tab: 'games', title: 'Missions & Games' },
  multiplayer: { tab: 'multiplayer', title: 'Multiplayer' },
  library: { tab: 'location', title: 'Location Library' },
  settings: { tab: 'settings', title: 'Settings' },
  controls: { tab: 'controls', title: 'Controls & Quick Start' }
};

function setupGlobeHub({
  globeSelector,
  onEarthMode,
  onLaunchMode,
  primeMultiplayerUi
}) {
  const overlay = document.getElementById('globeHubOverlay');
  const panelHost = document.getElementById('globeHubPanelHost');
  const footerHost = document.getElementById('globeHubFooterHost');
  const overlayTitle = document.getElementById('globeHubOverlayTitle');

  const setActiveDestination = (destination = 'location') => {
    document.querySelectorAll('[data-globe-destination]').forEach((button) => {
      button.classList.toggle('active', button.dataset.globeDestination === destination);
    });
  };

  const closePanel = () => {
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }
    panelHost?.querySelectorAll('.tab-content').forEach((panel) => panel.classList.remove('active'));
    setActiveDestination('location');
  };

  const openPanel = (destination) => {
    const target = HUB_PANELS[destination];
    const panel = target ? document.getElementById(`tab-${target.tab}`) : null;
    if (!target || !panel || !overlay || !panelHost) return false;
    panelHost.querySelectorAll('.tab-content').forEach((node) => node.classList.remove('active'));
    panel.classList.add('active');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    if (overlayTitle) overlayTitle.textContent = target.title;
    setActiveDestination(destination);
    if (destination === 'multiplayer') primeMultiplayerUi();
    return true;
  };

  if (panelHost) {
    ['location', 'games', 'multiplayer', 'settings', 'controls'].forEach((tabName) => {
      const panel = document.getElementById(`tab-${tabName}`);
      if (panel) panelHost.appendChild(panel);
    });
    const challengeButton = document.querySelector('.flowerChallengeToggleBtn');
    const gamesPanel = document.getElementById('tab-games');
    if (challengeButton && gamesPanel) gamesPanel.prepend(challengeButton);
    const challengePanel = document.getElementById('flowerChallengePanel');
    if (challengePanel && overlay) overlay.appendChild(challengePanel);
  }

  const titleFooter = document.querySelector('.title-footer');
  if (titleFooter && footerHost) footerHost.appendChild(titleFooter);
  document.getElementById('globeHubOverlayCloseBtn')?.addEventListener('click', closePanel);
  document.getElementById('globeHubShareBtn')?.addEventListener('click', () => {
    document.getElementById('shareExperienceBtn')?.click();
  });
  document.getElementById('globeHubFullscreenBtn')?.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.();
  });

  document.querySelectorAll('[data-globe-destination]').forEach((button) => {
    button.addEventListener('click', () => {
      const destination = button.dataset.globeDestination;
      if (destination === 'location') {
        closePanel();
        document.getElementById('globeSelectorExploreModeBtn')?.click();
      } else if (destination === 'live-earth') {
        closePanel();
        setActiveDestination('live-earth');
        document.getElementById('globeSelectorLiveEarthModeBtn')?.click();
      } else {
        openPanel(destination);
      }
    });
  });

  document.getElementById('globeSelectorEarthBtn')?.addEventListener('click', () => {
    onEarthMode();
    closePanel();
    document.getElementById('globeSelectorExploreModeBtn')?.click();
  });
  document.getElementById('globeSelectorMarsBtn')?.addEventListener('click', () => {
    globeSelector.close();
    onLaunchMode('mars');
  });
  document.getElementById('globeSelectorOceanBtn')?.addEventListener('click', () => {
    globeSelector.close();
    onLaunchMode('ocean');
  });

  return { closePanel, openPanel };
}

export { setupGlobeHub };
