import { createPlayerIntroduction } from './player-introduction.js';
import { applyPlayerIntroduction } from '../character/journey-preferences.js';
import { CAREER_EXPERIENCES, experienceById } from '../experiences/catalog.js';
import { continuableExperienceId } from '../experiences/career-availability.js';
import {
  getPlayerCharacterGender,
  setPlayerCharacterGender,
} from '../../../js/player-character-preference.js?v=1';

const escape = (value) =>
  String(value || '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const image = (name) => new URL(`../../../assets/gallery/5.6/${name}`, import.meta.url).href;
const worlds = [
  ['earth', 'Earth', 'earth.jpg'],
  ['moon', 'Moon', 'moon.jpg'],
  ['mars', 'Mars', 'mars.jpg'],
  ['space', 'Space', 'space.jpg'],
  ['ocean', 'Ocean', 'ocean-gameplay-20261104.png'],
];

// Presentation over existing profile, title/globe, tutorial and activity owners.
// No runtime context writes, player grants, provider or animation loop.
export function createPlayerEntry({
  runtime,
  getStore,
  getGlobe,
  onActivities,
  onJournal,
  onHub,
  onReturn,
  readReturn,
  onBeginWorld,
}) {
  const landing = document.createElement('section');
  landing.id = 'playerEntryScreen';
  landing.hidden = true;
  landing.setAttribute('aria-label', 'World Explorer home');
  const dialog = document.createElement('dialog');
  dialog.id = 'playerIntroduction';
  dialog.setAttribute('aria-label', 'Start your World Explorer journey');
  const status = document.createElement('p');
  status.className = 'player-entry-status';
  status.setAttribute('role', 'status');
  const pane = document.createElement('div');
  pane.tabIndex = -1;
  dialog.append(status, pane);
  document.body.append(landing, dialog);
  let profile = null,
    busy = false,
    choosingPlace = false,
    generation = 0,
    disposed = false;
  const canSelectVehicle = (id) => {
    if (id === 'bmw_e34') return true;
    try {
      return !!runtime.getVehicleGarage?.()?.vehicles?.[id];
    } catch {
      return false;
    }
  };
  function selectedPlace() {
    const point = getGlobe()?.getSelection?.() || runtime.resolveLocationSelection?.();
    return point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
      ? {
          ...point,
          name: point.name || 'Selected place',
          world: 'earth',
          image: 'walking-a8119ad855de.webp',
        }
      : null;
  }
  const flow = createPlayerIntroduction({
    onChange: renderIntroduction,
    readDestination: selectedPlace,
    canSelectVehicle,
    onBegin: (draft) => void begin(draft),
  });
  function renderIntroduction() {
    const scroll =
      pane.querySelector('.intro-split,.intro-careers,.intro-departure')?.scrollTop || 0;
    const previous = pane.dataset.step;
    const choiceScroll = pane.querySelector('.intro-choices')?.scrollTop || 0;
    const chipScroll = pane.querySelector('.chip-row')?.scrollLeft || 0;
    pane.innerHTML = flow.render();
    pane.dataset.step = String(flow.snapshot().step);
    flow.mount(pane);
    if (previous === pane.dataset.step) {
      const content = pane.querySelector('.intro-split,.intro-careers,.intro-departure');
      if (content) content.scrollTop = scroll;
      const choices = pane.querySelector('.intro-choices');
      if (choices) choices.scrollTop = choiceScroll;
      const chips = pane.querySelector('.chip-row');
      if (chips) chips.scrollLeft = chipScroll;
    } else pane.focus({ preventScroll: true });
    dialog.setAttribute('aria-busy', String(busy));
    if (busy) for (const button of pane.querySelectorAll('button')) button.disabled = true;
  }
  function closeIntroduction() {
    flow.dispose();
    if (dialog.open) dialog.close();
    status.textContent = '';
  }
  async function begin(draft) {
    if (busy || disposed) return;
    const destination = draft.destination || selectedPlace();
    if (
      !destination ||
      (['earth', 'ocean'].includes(destination.world) &&
        (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lon)))
    ) {
      choosingPlace = true;
      closeIntroduction();
      getGlobe()?.open();
      getGlobe()?.setSearchStatus?.(
        'Choose where your journey begins, then use this starting place.'
      );
      return;
    }
    busy = true;
    status.textContent = 'Saving your Explorer…';
    renderIntroduction();
    const version = ++generation,
      uid = runtime.getAccountUserId?.() || '';
    try {
      const store = await getStore();
      if (version !== generation || disposed) return;
      profile = await store.saveProfile((current) => {
        if ((runtime.getAccountUserId?.() || '') !== uid)
          throw Error('Your account changed. Review your Explorer and try again.');
        return applyPlayerIntroduction(current, draft, { ownsVehicle: canSelectVehicle });
      });
      if (version !== generation || disposed) return;
      if ((runtime.getAccountUserId?.() || '') !== uid)
        throw Error('Your account changed. Your saved Explorer is kept.');
      setPlayerCharacterGender(draft.gender);
      closeIntroduction();
      landing.hidden = true;
      document.body.classList.remove('player-entry-open');
      const result = await onBeginWorld(
        draft.destination || selectedPlace(),
        draft.guided !== false,
        draft
      );
      if (result === false)
        runtime.showToast?.('Your Explorer is saved. Choose a place on the globe to try again.');
    } catch (error) {
      if (version !== generation || disposed) return;
      if (!dialog.open && !runtime.gameStarted) dialog.showModal();
      status.textContent =
        error.message || 'Your Explorer could not be saved. Your progress is kept. Try again.';
    } finally {
      busy = false;
      if (dialog.open) renderIntroduction();
    }
  }
  function renderLanding() {
    const saved = readReturn?.(),
      prefs = profile?.journeyPreferences;
    const focus = CAREER_EXPERIENCES.find(
      (c) => c.id === prefs?.activeFocusId && c.releaseStatus === 'ready'
    );
    const active = experienceById(continuableExperienceId(profile?.activeExperience?.experienceId));
    const secondaryClass = active ? '' : 'entry-primary';
    const continueAction = active
      ? `<button class="entry-primary" data-entry="continue-task">Continue ${escape(active.label)} →</button>`
      : '';
    const placeAction = saved
      ? `<button class="${secondaryClass}" data-entry="return">Return to ${escape(saved.name)} →</button>`
      : `<button class="${secondaryClass}" data-entry="journey">Start your journey →</button>`;
    landing.innerHTML = `<header class="player-entry-header"><button class="entry-brand" data-entry="home"><span>◎</span> WORLD EXPLORER <em>3D</em></button><nav id="playerHomeNavigation" aria-label="Main destinations"><button data-entry="explore">Explore</button><button data-entry="careers">Careers</button><button data-entry="create">Create</button><button data-entry="together">Together</button><button data-entry="journal">Journal</button><button data-entry="settings">Settings</button></nav><a href="../account/">Sign in / Account</a><button data-entry="menu" aria-label="Open home menu" aria-controls="playerHomeNavigation" aria-expanded="false">☰</button></header>
    <section class="landing-hero"><img src="${image('drone-cf7691b9c943.webp')}" alt="World Explorer gameplay above mapped Baltimore"><div class="landing-hero-copy"><span class="entry-eyebrow">ONE EXPLORER. A WORLD OF POSSIBILITIES.</span><h1>Make the world<br>your next story.</h1><p>Choose who you are. Find what moves you. Start on familiar streets, head out to sea, or set your sights beyond Earth.</p><div class="entry-actions">${continueAction}${placeAction}<button data-entry="explore">Explore freely</button></div><small>${prefs?.introCompletedAt ? `${escape(prefs.explorerName)} · ${escape(focus?.label || 'Free exploration')}` : 'Your Explorer → Your direction → Your first car → Your starting place'}</small>${saved ? '<button class="entry-personalize" data-entry="journey">Personalize your Explorer ↗</button>' : ''}</div><span class="landing-image-credit">Actual gameplay · mapped Baltimore</span></section>
    <section class="landing-worlds"><div><span class="entry-eyebrow">CHOOSE YOUR HORIZON</span><h2>A globe. An ocean.<br>A sky full of places.</h2><button data-entry="explore">Open globe selector ↗</button></div><div class="world-destinations">${worlds.map(([id, label, asset]) => `<button data-entry-world="${id}"><img src="${new URL(`../../assets/textures/ui-thumbnails/${asset}`, import.meta.url).href}" alt=""><strong>${label}</strong></button>`).join('')}</div></section>
    <section class="landing-experiences"><span class="entry-eyebrow">FIND YOUR KIND OF ADVENTURE</span><h2>More than one way to explore.</h2><div class="landing-feature-grid">${[
      [
        'career:racer',
        'Racing & driving',
        'Choose a real car, find an event or build a course of your own.',
        'driving-1b41f3116f83.webp',
      ],
      [
        'career:geologist',
        'Fieldwork & discovery',
        'Read the landscape, uncover the past and keep a record of what you learn.',
        'museum-ec196f05eadc.webp',
      ],
      [
        'career:oceanographer',
        'Oceans & marine life',
        'Board a research vessel, explore underwater and return with a story.',
        'research-deck-40e79f50319d.webp',
      ],
      [
        'career:planetary-scientist',
        'Space & the night sky',
        'Navigate the Solar System and prepare for planetary fieldwork.',
        'space-fd854981b14d.webp',
      ],
    ]
      .map(
        ([id, label, copy, asset]) =>
          `<button class="landing-feature" data-entry-career="${id}"><img src="${image(asset)}" alt="Actual ${label.toLowerCase()} gameplay"><span><strong>${label}</strong><p>${copy}</p><em>Discover more ↗</em></span></button>`
      )
      .join(
        ''
      )}</div><button data-entry="careers">Browse all careers & activities ↗</button></section>
    <section class="landing-create"><img src="${image('research-interior-cf113dcb5303.webp')}" alt="Actual research interior gameplay"><div><span class="entry-eyebrow">MAKE SOMETHING WORTH RETURNING TO</span><h2>A place of your own.<br>A journey to share.</h2><p>Build a workspace, create a route or track, keep an album, and meet other Explorers in shared rooms.</p><div class="entry-actions"><button class="entry-primary" data-entry="create">Create & build</button><button data-entry="together">Explore together</button></div></div></section>
    <footer class="player-entry-footer"><button data-entry="journal">Open Journal</button><button data-entry="settings">Settings & accessibility</button><a href="../account/">Your account</a><a href="../legal/privacy">Privacy</a><a href="../legal/terms">Terms</a></footer>`;
  }
  function hideLanding() {
    landing.hidden = true;
    document.body.classList.remove('player-entry-open');
  }
  function explore() {
    hideLanding();
    getGlobe()?.open();
  }
  async function open() {
    if (disposed || runtime.gameStarted) return;
    choosingPlace = false;
    closeIntroduction();
    getGlobe()?.close();
    landing.hidden = false;
    document.body.classList.add('player-entry-open');
    renderLanding();
    landing.scrollTop = 0;
    const version = ++generation;
    try {
      const value = await (await getStore()).getProfile();
      if (version === generation && !landing.hidden) {
        profile = value;
        renderLanding();
      }
    } catch {
      if (!landing.hidden) {
        const p = document.createElement('p');
        p.className = 'player-entry-status';
        p.textContent =
          'Your saved Explorer could not load. Your progress is kept. You can still choose a place and explore.';
        landing.append(p);
      }
    }
  }
  async function introduce(id) {
    if (busy || disposed) return;
    try {
      profile = await (await getStore()).getProfile();
    } catch {
      runtime.showToast?.('Your Explorer could not load. Your saved progress is kept. Try again.');
      return;
    }
    hideLanding();
    getGlobe()?.close();
    flow.load({
      ...profile.journeyPreferences,
      gender: profile.journeyPreferences?.gender || getPlayerCharacterGender(),
    });
    flow.restart();
    if (id) flow.startWithCareer(id);
    if (!dialog.open) dialog.showModal();
    renderIntroduction();
  }
  landing.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset.entry;
    const header = landing.querySelector('.player-entry-header'),
      menu = landing.querySelector('[data-entry=menu]');
    if (action === 'menu') {
      const expanded = header.classList.toggle('entry-menu-open');
      menu.setAttribute('aria-expanded', String(expanded));
      if (expanded) header.querySelector('nav button')?.focus();
      return;
    }
    header.classList.remove('entry-menu-open');
    menu.setAttribute('aria-expanded', 'false');
    if (action === 'home') void open();
    if (action === 'journey') void introduce();
    if (action === 'explore') explore();
    if (action === 'return') {
      hideLanding();
      void onReturn();
    }
    if (action === 'continue-task') {
      explore();
      void onActivities({ view: 'continue' });
    }
    if (action === 'careers') {
      explore();
      void onActivities({ view: 'careers' });
    }
    if (action === 'journal') {
      explore();
      onJournal();
    }
    if (['create', 'together', 'settings'].includes(action)) {
      explore();
      onHub(action);
    }
    if (button.dataset.entryCareer) {
      explore();
      void onActivities({ experienceId: button.dataset.entryCareer });
    }
    if (button.dataset.entryWorld) {
      explore();
      if (button.dataset.entryWorld !== 'earth') onHub(button.dataset.entryWorld);
    }
  });
  landing.addEventListener('pointerdown', (event) => {
    const header = landing.querySelector('.entry-menu-open');
    if (header && !header.contains(event.target)) {
      header.classList.remove('entry-menu-open');
      landing.querySelector('[data-entry=menu]').setAttribute('aria-expanded', 'false');
    }
  });
  landing.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && landing.querySelector('.entry-menu-open')) {
      event.preventDefault();
      event.stopPropagation();
      landing.querySelector('.entry-menu-open').classList.remove('entry-menu-open');
      const toggle = landing.querySelector('[data-entry=menu]');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    }
  });
  pane.addEventListener('input', (event) => flow.input(event.target));
  pane.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || busy) return;
    if (button.dataset.intro === 'exit') {
      closeIntroduction();
      void open();
      return;
    }
    if (button.dataset.intro === 'choose-place') {
      choosingPlace = true;
      closeIntroduction();
      getGlobe()?.open();
      return;
    }
    const previousStep = flow.snapshot().step;
    if (flow.click(button) && previousStep === flow.snapshot().step) {
      for (const attribute of [
        'data-gender',
        'data-intro-career',
        'data-intro-car',
        'data-intro-group',
      ]) {
        const value = button.getAttribute(attribute);
        if (value !== null)
          pane
            .querySelector(`[${attribute}="${CSS.escape(value)}"]`)
            ?.focus({ preventScroll: true });
      }
    }
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!busy) {
      closeIntroduction();
      void open();
    }
  });
  document
    .getElementById('globeSelectorBackBtn')
    ?.setAttribute('aria-label', 'Back to home or the current world');
  return {
    open,
    explore,
    introduce,
    isChoosingPlace: () => choosingPlace,
    acceptPlaceSelection(place) {
      if (!choosingPlace) return false;
      return this.acceptEnvironmentSelection('earth', place);
    },
    acceptEnvironmentSelection(world, place = selectedPlace()) {
      if (!choosingPlace) return false;
      choosingPlace = false;
      getGlobe()?.close();
      flow.setDestination({
        ...place,
        world,
        name:
          world === 'earth'
            ? place.name
            : world === 'ocean'
              ? 'Selected ocean departure'
              : world === 'moon'
                ? 'The Moon'
                : world === 'mars'
                  ? 'Mars'
                  : 'Solar System',
        image:
          world === 'earth'
            ? 'walking-a8119ad855de.webp'
            : world === 'ocean'
              ? 'research-deck-40e79f50319d.webp'
              : 'space-fd854981b14d.webp',
      });
      if (!dialog.open) dialog.showModal();
      renderIntroduction();
      return true;
    },
    backFromGlobe() {
      if (choosingPlace) {
        choosingPlace = false;
        if (!dialog.open) dialog.showModal();
        renderIntroduction();
      } else void open();
    },
    snapshot: () => ({
      home: !landing.hidden,
      introduction: dialog.open,
      choosingPlace,
      busy,
      step: flow.snapshot().step,
    }),
    dispose() {
      disposed = true;
      generation++;
      closeIntroduction();
      hideLanding();
      landing.remove();
      dialog.remove();
    },
  };
}
