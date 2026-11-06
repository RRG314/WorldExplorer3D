// Explicit landing-page navigation waits for the original account/save owner.
// This coordinates presentation only; it never creates or changes a profile.
export function createEntryIntent({ href, blocked = false, replaceHref, openCharacter, openCareers }) {
  const url = new URL(href);
  const requested = url.searchParams.get('entry');
  let pending = !blocked && ['character', 'careers'].includes(requested) ? requested : null;
  let globeReady = false, accountReady = false;
  function resume() {
    if (!pending || !globeReady || !accountReady) return false;
    const entry = pending;
    pending = null;
    url.searchParams.delete('entry');
    replaceHref(url.href);
    if (entry === 'character') openCharacter();
    else openCareers();
    return true;
  }
  return {
    globeOpened() { globeReady = true; return resume(); },
    accountState(state) { accountReady = state?.blocking === false; return resume(); },
  };
}
