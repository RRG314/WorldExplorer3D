// Installation belongs to the browser. Never request permissions, store tokens,
// cache the game or guess that accepting a prompt means installation completed.
(() => {
  const button = document.getElementById('installAppBtn');
  const status = document.getElementById('installStatus');
  const steps = document.getElementById('installSteps');
  if (!button || !status || !steps) return;

  const standalone = window.matchMedia('(display-mode: standalone)');
  const minimal = window.matchMedia('(display-mode: minimal-ui)');
  const platform = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' :
    /Android/.test(navigator.userAgent) ? 'android' :
    /Windows|Macintosh|Linux|CrOS/.test(navigator.userAgent) ? 'desktop' : 'other';
  const instructions = steps.querySelector(`[data-install-platform="${platform}"]`);
  let pending = null;
  let busy = false;
  let installed = false;

  function isInstalled() {
    return installed || navigator.standalone === true || standalone.matches || minimal.matches ||
      window.WorldExplorerDistribution?.isGooglePlay === true;
  }
  function render(message) {
    const added = isInstalled();
    button.hidden = added || !window.isSecureContext;
    button.disabled = busy;
    button.textContent = busy ? 'Waiting for your device…' : pending ? 'Install World Explorer 3D' : 'Show install steps';
    button.setAttribute('aria-expanded', String(!!instructions?.open));
    status.textContent = added ? (installed ? 'Installation complete. Open World Explorer 3D from its icon on your device.' : 'You’re using the installed app. Open the game to explore.') : message ||
      (!window.isSecureContext ? 'Open this site over HTTPS to install securely.' :
        pending ? 'Install the free web app using your browser’s confirmation.' :
          'Follow the steps for your device. Your browser controls whether installation is available.');
  }
  window.addEventListener('beforeinstallprompt', event => {
    if (isInstalled() || !window.isSecureContext || typeof event.prompt !== 'function') return;
    event.preventDefault();
    pending = event;
    render();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    pending = null;
    render();
  });
  standalone.addEventListener('change', () => render());
  minimal.addEventListener('change', () => render());
  instructions?.addEventListener('toggle', () => button.setAttribute('aria-expanded', String(instructions.open)));
  button.addEventListener('click', async () => {
    if (busy || isInstalled()) return;
    if (!pending) {
      if (instructions) instructions.open = true;
      steps.focus();
      return;
    }
    const prompt = pending;
    pending = null; // Each browser event is single use, including dismiss/failure.
    busy = true;
    render();
    let message;
    try {
      // Call synchronously in the click gesture, before the first await.
      const result = await prompt.prompt();
      const choice = result || await prompt.userChoice;
      message = choice?.outcome === 'accepted' ?
        'Installation requested. Your device will finish setup; look for World Explorer 3D in your apps.' :
        'Installation cancelled. You can keep playing in your browser or install later from its menu.';
    } catch {
      if (instructions) instructions.open = true;
      message = 'The browser could not open installation. Follow the steps below, or keep playing in your browser.';
    } finally {
      busy = false;
      render(message);
    }
  });
  render();
})();
