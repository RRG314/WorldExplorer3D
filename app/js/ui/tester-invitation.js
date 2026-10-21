import { createLifecycleScope } from '../runtime/lifecycle-scope.js';

const DISMISSAL_KEY = 'we3d.tester-invitation.v1';
let lifetime = null;
let dismissedThisSession = false;

export function mountTesterInvitation({
  readStorage = key => globalThis.localStorage.getItem(key),
  writeStorage = (key, value) => globalThis.localStorage.setItem(key, value),
  document = globalThis.document
} = {}) {
  lifetime?.dispose('remount');
  const root = document.getElementById('testerInvitation');
  if (!root) return null;
  const scope = lifetime = createLifecycleScope('ui:tester-invitation');
  let saved = null;
  try { saved = readStorage?.(DISMISSAL_KEY); } catch { /* Dismissal still works without storage. */ }
  root.hidden = dismissedThisSession || saved === 'dismissed' || saved === 'interested';

  const dismiss = value => {
    const hadFocus = root.contains(document.activeElement);
    dismissedThisSession = true;
    root.hidden = true;
    try { writeStorage?.(DISMISSAL_KEY, value); } catch { /* No persistence is required to keep playing. */ }
    if (hadFocus) document.getElementById('globeSelectorStartBtn')?.focus({ preventScroll: true });
  };
  scope.listen(document.getElementById('testerInvitationClose'), 'click', () => dismiss('dismissed'));
  // This is a native mailto link. Opening a draft does not claim a submitted
  // registration, and no email/account/device details are sent by this view.
  scope.listen(document.getElementById('testerInvitationEmail'), 'click', () => dismiss('interested'));
  scope.listen(root, 'keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation(); dismiss('dismissed');
  });
  scope.listen(globalThis, 'storage', event => {
    if (event.key === DISMISSAL_KEY && ['dismissed', 'interested'].includes(event.newValue)) {
      dismissedThisSession = true; root.hidden = true;
    }
  });
  scope.defer(() => { root.hidden = true; }, 'view');
  return scope;
}
