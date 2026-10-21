import { createLifecycleScope } from '../runtime/lifecycle-scope.js';

const DISMISSAL_KEY = 'we3d.tester-invitation.v1';
let lifetime = null;
let dismissedThisSession = false;

export function mountTesterInvitation({
  readStorage = key => globalThis.localStorage.getItem(key),
  writeStorage = (key, value) => globalThis.localStorage.setItem(key, value),
  document = globalThis.document,
  submitInterest = async (body, signal) => (await import('../../../js/function-api.js?v=3')).postAppCheckedFunction('/registerAppTester', body, {signal, timeoutMs:20000, label:'Tester signup'})
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
  const open = document.getElementById('testerInvitationOpen');
  const form = document.getElementById('testerInvitationForm');
  const status = document.getElementById('testerInvitationStatus');
  const submit = document.getElementById('testerInvitationSubmit');
  let pending = false;
  const request = new AbortController();
  scope.defer(() => request.abort(), 'request');
  scope.listen(open, 'click', () => {
    open.hidden = true; open.setAttribute('aria-expanded', 'true'); form.hidden = false;
    document.getElementById('testerInvitationAddress').focus();
  });
  scope.listen(form, 'submit', async event => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    pending = true; submit.disabled = true; status.hidden = false; status.textContent = 'Sending your confirmation email…';
    try {
      const result = await submitInterest({action:'request', email:document.getElementById('testerInvitationAddress').value.trim(), consent:true, consentVersion:'app-testing-v1'}, request.signal);
      if (request.signal.aborted) return;
      if (!result?.pending) throw new Error('Could not confirm your request. Please try again.');
      form.hidden = true;
      status.textContent = 'Check your inbox. Open our email and confirm your interest within one hour.';
      // Pending is not confirmed consent; keep success visible until dismissal.
    } catch (_) {
      if (request.signal.aborted) return;
      status.textContent = 'We couldn’t confirm your request. If an email arrives, use its confirmation link. Otherwise, wait a few minutes and try again.';
    } finally { pending = false; submit.disabled = false; }
  });
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
