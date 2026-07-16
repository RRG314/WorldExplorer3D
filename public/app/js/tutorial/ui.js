export function createTutorialUi(options = {}) {
  const { runtime, safeCall, setTutorialEnabled, restartTutorial } = options;

function createCardIfNeeded() {
  if (runtime.card) return;
  const card = document.createElement('aside');
  card.id = 'tutorialHintCard';
  card.setAttribute('aria-live', 'polite');
  card.style.cssText = [
    'position:fixed',
    'right:18px',
    'bottom:18px',
    'max-width:min(360px,calc(100vw - 30px))',
    'padding:12px 12px 10px',
    'background:rgba(255,255,255,0.97)',
    'border:2px solid rgba(102,126,234,0.35)',
    'border-radius:12px',
    'box-shadow:0 14px 36px rgba(2,6,23,0.32)',
    'z-index:250',
    'display:none',
    'backdrop-filter:blur(8px)',
    'font-family:Inter,sans-serif',
    'pointer-events:auto'
  ].join(';');

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px';

  const title = document.createElement('div');
  title.style.cssText = 'font-family:Poppins,sans-serif;font-size:13px;font-weight:700;color:#1e293b';

  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss tutorial hint');
  close.textContent = '×';
  close.style.cssText = 'border:none;background:#e2e8f0;color:#334155;border-radius:999px;width:24px;height:24px;font-size:16px;line-height:24px;cursor:pointer;flex:0 0 auto';

  const body = document.createElement('div');
  body.style.cssText = 'font-size:12px;line-height:1.45;color:#475569;white-space:pre-line';

  const action = document.createElement('button');
  action.type = 'button';
  action.style.cssText = 'margin-top:9px;border:none;background:linear-gradient(135deg,#0f3460,#533483);color:#fff;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;display:none';

  head.appendChild(title);
  head.appendChild(close);
  card.appendChild(head);
  card.appendChild(body);
  card.appendChild(action);
  document.body.appendChild(card);

  runtime.card = card;
  runtime.titleEl = title;
  runtime.bodyEl = body;
  runtime.actionBtn = action;
  runtime.closeBtn = close;

  close.addEventListener('click', () => hidePrompt());
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

  const wrap = document.createElement('div');
  wrap.id = 'tutorialSettingsCard';
  wrap.style.cssText = 'margin-top:18px;background:#f8fafc;border:2px solid #dbe5f5;border-radius:12px;padding:14px';

  const heading = document.createElement('div');
  heading.textContent = '🎓 Guided Walkthrough';
  heading.style.cssText = 'font-family:Poppins,sans-serif;font-size:15px;font-weight:600;color:#667eea;margin-bottom:10px';

  const label = document.createElement('label');
  label.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:12px;color:#334155;cursor:pointer;margin-bottom:10px';

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.id = 'tutorialEnabledToggle';
  toggle.style.cssText = 'width:16px;height:16px;cursor:pointer';

  const text = document.createElement('span');
  text.textContent = 'Enable first-time guided walkthrough';

  label.appendChild(toggle);
  label.appendChild(text);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';

  const restartBtn = document.createElement('button');
  restartBtn.type = 'button';
  restartBtn.id = 'tutorialRestartBtn';
  restartBtn.textContent = 'Restart Tutorial';
  restartBtn.style.cssText = 'background:#334155;border:none;border-radius:8px;padding:8px 12px;color:#fff;font-size:12px;font-weight:600;cursor:pointer';

  const status = document.createElement('div');
  status.id = 'tutorialSettingsStatus';
  status.style.cssText = 'font-size:11px;color:#64748b;min-height:16px;margin-top:8px';

  row.appendChild(restartBtn);
  wrap.appendChild(heading);
  wrap.appendChild(label);
  wrap.appendChild(row);
  wrap.appendChild(status);
  tabSettings.appendChild(wrap);

  runtime.settingsMount = wrap;
  runtime.settingsStatus = status;
  runtime.settingsToggle = toggle;
  runtime.settingsRestartBtn = restartBtn;

  toggle.checked = runtime.state.enabled;
  status.textContent = runtime.state.completed ? 'Tutorial completed on this browser.' : 'Tutorial is ready.';

  toggle.addEventListener('change', () => {
    setTutorialEnabled(!!toggle.checked);
  });
  restartBtn.addEventListener('click', () => {
    restartTutorial();
  });
}

function updateSettingsStatus(text) {
  if (runtime.settingsStatus) runtime.settingsStatus.textContent = text || '';
  if (runtime.settingsToggle) runtime.settingsToggle.checked = runtime.state.enabled;
}

function hidePrompt() {
  if (runtime.dismissTimer) {
    clearTimeout(runtime.dismissTimer);
    runtime.dismissTimer = 0;
  }
  runtime.currentButtonAction = null;
  if (runtime.card) runtime.card.style.display = 'none';
}


  return { createCardIfNeeded, ensureSettingsControls, hidePrompt, updateSettingsStatus };
}
