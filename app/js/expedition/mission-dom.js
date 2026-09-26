// Server snapshots and mutation responses can publish the same mission twice.
// Keep unchanged controls, focus and the shared panel's scroll target stable.
const publishedMarkup = new WeakMap();

export function publishMissionMarkup(host, markup) {
  if (publishedMarkup.get(host) === markup) return false;
  const document = host.ownerDocument;
  const focusedId = host.contains(document.activeElement) ? document.activeElement.id : '';
  const template = document.createElement('template');
  template.innerHTML = markup;
  const existingShared = host.querySelector('.expeditionShared');
  const nextShared = template.content.querySelector('.expeditionShared');
  if (existingShared && nextShared) {
    // Preserve the section itself so an in-progress scroll does not target a
    // detached element. Its changed controls receive fresh listeners below.
    existingShared.replaceChildren(...nextShared.childNodes);
    nextShared.replaceWith(existingShared);
  }
  host.replaceChildren(template.content);
  publishedMarkup.set(host, markup);
  if (focusedId) {
    const replacement = document.getElementById(focusedId);
    if (replacement && host.contains(replacement) && !replacement.disabled) {
      replacement.focus({ preventScroll: true });
    }
  }
  return true;
}
