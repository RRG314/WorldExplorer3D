(() => {
  const SECTION_META = Object.freeze({
    overview: ['Overview', 'Your account and saved world improvements.'],
    contributions: ['My contributions', 'Edit, submit and track your building improvements.'],
    review: ['Review improvements', 'Inspect a submitted version, make a decision, then test it in the world.'],
    profile: ['Profile', 'Private identity and the public creator card are kept clearly separated.'],
    social: ['Friends & Rooms', 'Manage friends and room invitations without mixing them into account security.'],
    support: ['Support & Receipts', 'Optional donations, billing controls, and receipt history.'],
    security: ['Security & Privacy', 'Review sign-in details and use sensitive account actions deliberately.']
  });

  const buttons = [...document.querySelectorAll('[data-account-target]')];
  const views = [...document.querySelectorAll('[data-account-view]')];
  const title = document.getElementById('accountPageTitle');
  const subtitle = document.getElementById('accountPageSubtitle');

  function setSection(section, options = {}) {
    const next = Object.hasOwn(SECTION_META, section) ? section : 'overview';
    const [nextTitle, nextSubtitle] = SECTION_META[next];
    views.forEach((view) => { view.hidden = view.dataset.accountView !== next; });
    buttons.forEach((button) => {
      const active = button.dataset.accountTarget === next;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (title) title.textContent = nextTitle;
    if (subtitle) subtitle.textContent = nextSubtitle;
    document.title = `${nextTitle} · World Explorer Account Center`;
    if (options.history !== false) {
      const url = new URL(window.location.href);
      if (next === 'overview') url.searchParams.delete('section');
      else url.searchParams.set('section', next);
      window.history.pushState({ accountSection: next }, '', url);
    }
    window.dispatchEvent(new CustomEvent('we3d:account-section',{detail:{section:next}}));
    document.querySelector('.wrap')?.scrollTo?.({ top: 0, behavior: options.instant ? 'auto' : 'smooth' });
  }

  buttons.forEach((button) => button.addEventListener('click', () => {
    setSection(String(button.dataset.accountTarget || 'overview'));
  }));
  window.addEventListener('popstate', () => {
    setSection(new URL(window.location.href).searchParams.get('section') || 'overview', { history: false, instant: true });
  });

  setSection(new URL(window.location.href).searchParams.get('section') || 'overview', { history: false, instant: true });
})();
