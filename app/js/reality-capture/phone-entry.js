import { observeAuth, getCurrentUser, signInWithGoogle, signInWithEmailPassword, signOutUser, resolveRedirectSignIn } from '../../../js/auth-ui.js?v=55';
import { listMyRealityCaptures } from '../../../js/community-reality-capture-api.js?v=4';
import { openRealityCaptureSession, closeRealityCapture } from './ui.js?v=2';

const status = document.getElementById('phoneStatus');
let generation = 0;
const selectedCapture = () => new URLSearchParams(location.hash.slice(1)).get('capture') || '';

async function openCapture(id) {
  const token = generation;
  try {
    status.textContent = 'Opening your capture…';
    await openRealityCaptureSession(id);
    if (token === generation) status.textContent = 'Your capture is open. Uploaded photos are shared across your devices; unsaved photos stay on the device that took them.';
  } catch (error) {
    if (token === generation) status.textContent = error.status === 404
      ? 'This capture is unavailable for this account. Sign in with the account that started it, or select one of your captures below.' : error.message;
  }
}

async function refreshList() {
  const token = generation;
  const uid = getCurrentUser()?.uid;
  if (!uid) return;
  try {
    const result = await listMyRealityCaptures();
    if (token !== generation || getCurrentUser()?.uid !== uid) return;
    const list = document.getElementById('captureList');
    list.replaceChildren();
    for (const capture of result.captures || []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${capture.building?.label || 'Mapped building'} · ${capture.room?.label || 'Exterior'} · ${capture.status.replaceAll('_', ' ')}`;
      button.addEventListener('click', () => {
        history.replaceState(null, '', `#capture=${encodeURIComponent(capture.captureId)}`);
        void openCapture(capture.captureId);
      });
      list.appendChild(button);
    }
    if (!list.children.length) list.textContent = 'No captures yet. Select a mapped building in the world and choose Improve this place.';
  } catch (error) { if (token === generation) status.textContent = error.message; }
}

document.getElementById('googleSignIn').addEventListener('click', async () => {
  try {
    if (getCurrentUser()?.isAnonymous) await signOutUser();
    await signInWithGoogle();
  } catch (error) { status.textContent = error.message; }
});
document.getElementById('emailSignIn').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  button.disabled = true;
  try { await signInWithEmailPassword(form.elements.email.value, form.elements.password.value); }
  catch (error) { status.textContent = error.message; }
  finally { form.elements.password.value = ''; button.disabled = false; }
});
document.getElementById('switchAccount').addEventListener('click', () => signOutUser().catch((error) => { status.textContent = error.message; }));
document.getElementById('refreshCaptures').addEventListener('click', refreshList);
window.addEventListener('hashchange', () => { if (selectedCapture() && getCurrentUser()) void openCapture(selectedCapture()); });
observeAuth(async (user) => {
  const token = ++generation;
  closeRealityCapture();
  document.getElementById('captureList').replaceChildren();
  const signedIn = user && !user.isAnonymous;
  document.getElementById('phoneSignIn').hidden = !!signedIn;
  document.getElementById('phoneCaptures').hidden = !signedIn;
  document.getElementById('phoneAccount').textContent = signedIn ? `Signed in as ${user.email || user.displayName || 'Explorer'}` : '';
  status.textContent = signedIn ? 'Choose a capture below.' : 'Your capture link will remain here while you sign in.';
  if (!signedIn) return;
  await refreshList();
  if (token === generation && selectedCapture()) await openCapture(selectedCapture());
});
void resolveRedirectSignIn();
