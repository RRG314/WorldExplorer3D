export function createTutorialUi(options = {}) {
  const { runtime, safeCall, onLater, onSkip, setTutorialEnabled, restartTutorial } = options;

  function hidePrompt() {
    if (runtime.dismissTimer) {
      clearTimeout(runtime.dismissTimer);
      runtime.dismissTimer = 0;
    }
    runtime.currentButtonAction = null;
    runtime.currentStage = '';
    if (runtime.card) {
      runtime.card.hidden = true;
      setExpanded(false);
    }
  }

  function setExpanded(expanded) {
    if (!runtime.card) return;
    const open = expanded === true;
    runtime.card.classList.toggle('compact', !open);
    runtime.detailsBtn?.setAttribute('aria-expanded', String(open));
    if (runtime.detailsBtn) runtime.detailsBtn.textContent = open ? 'Less' : 'Details';
  }

  function createCardIfNeeded() {
    if (runtime.card) return;
    const card = document.createElement('aside');
    card.id = 'tutorialHintCard';
    card.className = 'tutorial-card compact';
    card.hidden = true;
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    card.setAttribute('aria-atomic', 'true');
    card.setAttribute('aria-label', 'First Journey guidance');

    const header = document.createElement('div');
    header.className = 'tutorial-card-head';
    const heading = document.createElement('div');
    const eyebrow = document.createElement('span');
    eyebrow.className = 'tutorial-eyebrow';
    const title = document.createElement('strong');
    title.className = 'tutorial-title';
    heading.append(eyebrow, title);
    const headerActions = document.createElement('div');
    headerActions.className = 'tutorial-head-actions';
    const details = document.createElement('button');
    details.type = 'button';
    details.className = 'tutorial-details-btn';
    details.setAttribute('aria-expanded', 'false');
    details.textContent = 'Details';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tutorial-icon-btn';
    close.setAttribute('aria-label', 'Show this tutorial step later');
    close.textContent = '×';
    headerActions.append(details, close);
    header.append(heading, headerActions);

    const body = document.createElement('p');
    body.className = 'tutorial-body';
    const progressTrack = document.createElement('div');
    progressTrack.className = 'tutorial-progress-track';
    const progress = document.createElement('span');
    progressTrack.appendChild(progress);

    const actions = document.createElement('div');
    actions.className = 'tutorial-actions';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'tutorial-primary';
    action.hidden = true;
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'tutorial-secondary';
    later.textContent = 'Not now';
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'tutorial-text-btn';
    skip.textContent = 'Turn off tips';
    actions.append(action, later, skip);
    card.append(header, body, progressTrack, actions);
    document.body.appendChild(card);

    Object.assign(runtime, {
      card,
      eyebrowEl: eyebrow,
      titleEl: title,
      bodyEl: body,
      progressEl: progress,
      actionBtn: action,
      laterBtn: later,
      skipBtn: skip,
      closeBtn: close
      ,detailsBtn: details
    });

    details.addEventListener('click', () => setExpanded(card.classList.contains('compact')));
    close.addEventListener('click', () => safeCall(onLater));
    later.addEventListener('click', () => safeCall(onLater));
    skip.addEventListener('click', () => safeCall(onSkip));
    action.addEventListener('click', () => {
      const fn = runtime.currentButtonAction;
      hidePrompt();
      safeCall(fn);
    });
  }

  function ensureSettingsControls() {
    if (runtime.settingsMount) return;
    const tabSettings = document.getElementById('tab-settings');
    if (!tabSettings) return;
    const wrap = document.createElement('section');
    wrap.id = 'tutorialSettingsCard';
    wrap.className = 'tutorial-settings-card';
    wrap.innerHTML = `
      <span class="tutorial-settings-eyebrow">Learning</span>
      <h3>First Journey</h3>
      <p>Three optional, learn-by-doing steps cover movement, one nearby interaction, and choosing an adventure. System tips appear once, only when you enter that system.</p>
      <label><input id="tutorialEnabledToggle" type="checkbox"> <span>Show First Journey and contextual tips</span></label>
      <div class="tutorial-settings-actions"><button id="tutorialRestartBtn" type="button">Replay First Journey</button></div>
      <div id="tutorialSettingsStatus" role="status"></div>
    `;
    tabSettings.appendChild(wrap);
    runtime.settingsMount = wrap;
    runtime.settingsStatus = wrap.querySelector('#tutorialSettingsStatus');
    runtime.settingsToggle = wrap.querySelector('#tutorialEnabledToggle');
    runtime.settingsRestartBtn = wrap.querySelector('#tutorialRestartBtn');
    runtime.settingsToggle.checked = runtime.state.enabled && !runtime.state.skipped;
    runtime.settingsToggle.addEventListener('change', () => setTutorialEnabled(!!runtime.settingsToggle.checked));
    runtime.settingsRestartBtn.addEventListener('click', () => restartTutorial());
  }

  function updateSettingsStatus(text) {
    if (runtime.settingsStatus) runtime.settingsStatus.textContent = text || '';
    if (runtime.settingsToggle) runtime.settingsToggle.checked = runtime.state.enabled && !runtime.state.skipped;
  }

  return { createCardIfNeeded, ensureSettingsControls, hidePrompt, setExpanded, updateSettingsStatus };
}
