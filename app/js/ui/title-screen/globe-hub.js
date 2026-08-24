import {
  CURATED_DESTINATIONS,
  MAJOR_CITY_DESTINATIONS
} from '../globe-selector/catalog.js?v=2';
import {
  loadRecentPlaces,
  loadSavedFavoriteCities
} from '../globe-selector/helpers.js?v=9';

const HUB_PANELS = {
  games: { tab: 'games', title: 'Missions & Games' },
  multiplayer: { tab: 'multiplayer', title: 'Multiplayer' },
  settings: { tab: 'settings', title: 'Settings' },
  controls: { tab: 'controls', title: 'Controls & Quick Start' }
};

const HUB_THEME_KEY = 'worldExplorer3D.hubTheme';
const HUB_THEMES = ['day', 'night'];

function setupHubTheme() {
  const button = document.getElementById('globeHubThemeBtn');
  if (!button) return;
  let mode = 'night';
  try {
    const stored = localStorage.getItem(HUB_THEME_KEY);
    if (HUB_THEMES.includes(stored)) mode = stored;
  } catch {
    // Keep the stable night default when browser storage is unavailable.
  }

  const apply = () => {
    document.documentElement.dataset.hubTheme = mode;
    const nextMode = mode === 'day' ? 'dark' : 'light';
    button.textContent = mode === 'day' ? '◒' : '☼';
    button.title = `Switch to ${nextMode} appearance`;
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', mode === 'day' ? 'true' : 'false');
  };

  button.addEventListener('click', () => {
    mode = HUB_THEMES[(HUB_THEMES.indexOf(mode) + 1) % HUB_THEMES.length];
    try { localStorage.setItem(HUB_THEME_KEY, mode); } catch {}
    apply();
  });
  apply();
}

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
  const liveEarthPanel = document.getElementById('globeSelectorLiveEarthPanel');
  const liveEarthHome = liveEarthPanel?.parentElement || null;
  const liveEarthNextSibling = liveEarthPanel?.nextSibling || null;
  const libraryPanel = document.createElement('section');
  libraryPanel.className = 'hub-library-panel';
  libraryPanel.hidden = true;

  const appendLibrarySection = (host, title, subtitle, places) => {
    const section = document.createElement('section');
    section.className = 'hub-library-section';
    const heading = document.createElement('header');
    const strong = document.createElement('strong');
    const description = document.createElement('span');
    strong.textContent = title;
    description.textContent = subtitle;
    heading.append(strong, description);
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'hub-library-grid';
    if (places.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hub-library-empty';
      empty.textContent = title === 'Saved Places'
        ? 'Use the star beside a selected location to add it here.'
        : 'Explored locations will appear here.';
      section.appendChild(empty);
    } else {
      places.forEach((place) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.libraryLat = String(place.lat);
        button.dataset.libraryLon = String(place.lon);
        button.dataset.libraryName = String(place.name || 'Selected place');
        const name = document.createElement('strong');
        const meta = document.createElement('span');
        name.textContent = place.name;
        meta.textContent = place.category || place.region || 'Saved location';
        button.append(name, meta);
        grid.appendChild(button);
      });
      section.appendChild(grid);
    }
    host.appendChild(section);
  };

  const renderLibraryPanel = () => {
    libraryPanel.replaceChildren();
    const canonicalPlaces = new Map(
      [...CURATED_DESTINATIONS, ...MAJOR_CITY_DESTINATIONS]
        .map((place) => [String(place.name || '').trim().toLowerCase(), place])
    );
    const useCanonicalCoordinates = (places) => places.map((place) => {
      const canonical = canonicalPlaces.get(String(place?.name || '').trim().toLowerCase());
      return canonical ? { ...place, lat: canonical.lat, lon: canonical.lon } : place;
    });
    const saved = useCanonicalCoordinates(loadSavedFavoriteCities());
    const recent = useCanonicalCoordinates(loadRecentPlaces());
    appendLibrarySection(libraryPanel, 'Saved Places', 'Your personal collection', saved);
    appendLibrarySection(libraryPanel, 'Recent', 'Locations you explored', recent);

    const regions = [...new Set(MAJOR_CITY_DESTINATIONS.map((city) => city.category))];
    regions.forEach((region) => {
      appendLibrarySection(
        libraryPanel,
        region,
        'Major cities',
        MAJOR_CITY_DESTINATIONS.filter((city) => city.category === region)
      );
    });

    const historic = CURATED_DESTINATIONS.filter((place) => /historic|landmark/i.test(place.category));
    const nature = CURATED_DESTINATIONS.filter((place) => !historic.includes(place));
    appendLibrarySection(libraryPanel, 'Historic Sites & Landmarks', 'Architecture, monuments, and cultural sites', historic);
    appendLibrarySection(libraryPanel, 'Nature & Landscapes', 'Parks, mountains, coastlines, and natural wonders', nature);
  };

  const multiplayerNav = document.querySelector('.mp-workspace-nav');
  multiplayerNav?.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-mp-panel-target]') : null;
    if (!(button instanceof HTMLButtonElement)) return;
    const target = button.dataset.mpPanelTarget;
    multiplayerNav.querySelectorAll('[data-mp-panel-target]').forEach((item) => {
      item.classList.toggle('active', item === button);
    });
    document.querySelectorAll('[data-mp-panel]').forEach((panel) => {
      const active = panel.getAttribute('data-mp-panel') === target;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
  });

  const setActiveDestination = (destination = 'location') => {
    document.querySelectorAll('[data-globe-destination]').forEach((button) => {
      button.classList.toggle('active', button.dataset.globeDestination === destination);
    });
  };

  const closePanel = () => {
    if (liveEarthPanel && liveEarthHome && liveEarthPanel.parentElement === panelHost) {
      liveEarthHome.insertBefore(liveEarthPanel, liveEarthNextSibling);
      liveEarthPanel.classList.remove('hub-center-panel');
      document.getElementById('globeSelectorExploreModeBtn')?.click();
    }
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }
    panelHost?.querySelectorAll('.tab-content').forEach((panel) => panel.classList.remove('active'));
    libraryPanel.hidden = true;
    libraryPanel.classList.remove('active');
    setActiveDestination('location');
  };

  const openPanel = (destination) => {
    if (destination === 'library' && overlay && panelHost) {
      panelHost.querySelectorAll('.tab-content, .hub-center-panel').forEach((node) => node.classList.remove('active'));
      renderLibraryPanel();
      libraryPanel.hidden = false;
      libraryPanel.classList.add('active');
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      if (overlayTitle) overlayTitle.textContent = 'My Places';
      setActiveDestination(destination);
      return true;
    }
    if (destination === 'live-earth' && liveEarthPanel && overlay && panelHost) {
      // Live Earth controls must stay beside the globe they operate. Moving
      // this panel into the full workspace overlay made its globe markers
      // unreachable while instructing players to tap one.
      closePanel();
      document.getElementById('globeSelectorLiveEarthModeBtn')?.click();
      setActiveDestination(destination);
      return true;
    }
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
    panelHost.appendChild(libraryPanel);
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

  const selectLibraryPlace = (event, activate = false) => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-library-lat][data-library-lon]')
      : null;
    if (!(button instanceof HTMLButtonElement)) return false;
    const lat = Number(button.dataset.libraryLat);
    const lon = Number(button.dataset.libraryLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    globeSelector.setSelection(lat, lon, {
      name: button.dataset.libraryName || 'Selected place',
      focus: true,
      arrivalMode: 'walk'
    });
    if (activate) {
      closePanel();
      void globeSelector.startHere();
    }
    return true;
  };
  libraryPanel.addEventListener('click', (event) => {
    selectLibraryPlace(event, false);
  });
  libraryPanel.addEventListener('dblclick', (event) => {
    if (selectLibraryPlace(event, true)) event.preventDefault();
  });

  const titleFooter = document.querySelector('.title-footer');
  if (titleFooter && footerHost) footerHost.appendChild(titleFooter);
  document.getElementById('globeHubOverlayCloseBtn')?.addEventListener('click', closePanel);
  document.getElementById('globeHubFullscreenBtn')?.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.();
  });
  setupHubTheme();

  document.querySelectorAll('[data-globe-destination]').forEach((button) => {
    button.addEventListener('click', () => {
      const destination = button.dataset.globeDestination;
      if (destination === 'location') {
        closePanel();
        document.getElementById('globeSelectorExploreModeBtn')?.click();
      } else if (destination === 'live-earth') {
        openPanel('live-earth');
      } else if (destination === 'library') {
        openPanel('library');
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
  return { closePanel, openPanel };
}

export { setupGlobeHub };
