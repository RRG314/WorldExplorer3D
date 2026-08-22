export function createTutorialUi(options = {}) {
  const { runtime, safeCall, onLater, onSkip, setTutorialEnabled, restartTutorial } = options;

  function hidePrompt() {
    if (runtime.dismissTimer) {
      clearTimeout(runtime.dismissTimer);
      runtime.dismissTimer = 0;
    }
    runtime.currentButtonAction = null;
    runtime.currentStage = '';
    if (runtime.card) runtime.card.hidden = true;
  }

  function createCardIfNeeded() {
    if (runtime.card) return;
    const card = document.createElement('aside');
    card.id = 'tutorialHintCard';
    card.className = 'tutorial-card';
    card.hidden = true;
    card.setAttribute('aria-live', 'polite');
    card.setAttribute('aria-label', 'First expedition guidance');

    const header = document.createElement('div');
    header.className = 'tutorial-card-head';
    const heading = document.createElement('div');
    const eyebrow = document.createElement('span');
    eyebrow.className = 'tutorial-eyebrow';
    const title = document.createElement('strong');
    title.className = 'tutorial-title';
    heading.append(eyebrow, title);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tutorial-icon-btn';
    close.setAttribute('aria-label', 'Show this tutorial step later');
    close.textContent = '×';
    header.append(heading, close);

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
    later.textContent = 'Later';
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'tutorial-text-btn';
    skip.textContent = 'Skip guide';
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
    });

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
      <h3>First Expedition</h3>
      <p>Three short steps introduce movement, field work, Journal knowledge and Backpack items. Advanced systems explain themselves when first opened.</p>
      <label><input id="tutorialEnabledToggle" type="checkbox"> <span>Show contextual guidance</span></label>
      <div class="tutorial-settings-actions"><button id="tutorialRestartBtn" type="button">Replay First Expedition</button></div>
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

  return { createCardIfNeeded, ensureSettingsControls, hidePrompt, updateSettingsStatus };
}
