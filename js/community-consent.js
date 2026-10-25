import { doc, getDocFromServer, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser, observeAuth } from './auth-ui.js?v=56';
import { initFirebase } from './firebase-init.js?v=58';

export const COMMUNITY_TERMS_VERSION = 'community-2026-10-24';
let pending = null;

function assertAccount(uid) {
  if (!uid || getCurrentUser()?.uid !== uid) throw new Error('Account changed. Please try again.');
}

function askForAcceptance(uid) {
  return new Promise((resolve, reject) => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.id = 'communityTermsDialog';
    dialog.setAttribute('aria-labelledby', 'communityTermsTitle');
    dialog.setAttribute('aria-describedby', 'communityTermsDescription');
    dialog.style.cssText = 'max-width:460px;width:calc(100% - 32px);max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;border:2px solid #667eea;border-radius:14px;padding:22px;background:#f8fafc;color:#1e293b;font:14px/1.55 system-ui;z-index:2147483000';
    dialog.innerHTML = `<h2 id="communityTermsTitle" style="margin:0 0 12px;font-size:20px">Explore together respectfully</h2>
      <div id="communityTermsDescription"><p>Before joining a room or sharing content, agree to the community rules. They apply to guests too.</p>
      <ul><li>No harassment, hate, threats, sexual content or exploitation.</li><li>Do not share someone’s personal details or upload material without permission.</li><li>Use Report for abuse. Block players to hide their chat and stop their invites. Shared world changes remain visible to keep the room consistent.</li></ul>
      <p>Shared content may be reviewed or removed, and accounts may be restricted for abuse.</p></div>
      <label style="display:flex;align-items:flex-start;gap:10px;margin:16px 0"><input id="communityTermsAgree" type="checkbox" style="margin-top:5px;min-width:18px;min-height:18px"><span>I agree to the <a href="/legal/terms.html#community-rules" target="_blank" rel="noopener">Terms and community rules</a>. <a href="/legal/privacy.html" target="_blank" rel="noopener">Privacy policy</a></span></label>
      <div style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap"><button id="communityTermsCancel" type="button" style="min-height:44px;padding:10px 16px;border:1px solid #cbd5e1;border-radius:8px;background:white;color:#334155">Not now</button><button id="communityTermsContinue" type="button" disabled style="opacity:.5;min-height:44px;padding:10px 16px;border:0;border-radius:8px;background:#667eea;color:white">Agree and continue</button></div>`;
    let unsubscribe = () => {}, finished = false;
    function finish(accepted, error) {
      if (finished) return;
      finished = true;
      unsubscribe();
      dialog.close(); dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
      error ? reject(error) : resolve(accepted);
    }
    document.body.append(dialog);
    const checkbox = dialog.querySelector('#communityTermsAgree');
    const continueButton = dialog.querySelector('#communityTermsContinue');
    checkbox.addEventListener('change', () => { continueButton.disabled = !checkbox.checked; continueButton.style.opacity = checkbox.checked ? '1' : '.5'; });
    continueButton.addEventListener('click', () => { if (checkbox.checked) finish(true); });
    dialog.querySelector('#communityTermsCancel').addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('keyup', event => event.stopPropagation());
    dialog.showModal();
    unsubscribe = observeAuth(user => {
      if (user?.uid !== uid) finish(false, new Error('Account changed. Please try again.'));
    });
    if (finished) unsubscribe();
  });
}

export async function ensureCommunityTerms(expectedUid = getCurrentUser()?.uid) {
  assertAccount(expectedUid);
  if (pending?.uid === expectedUid) return pending.promise;
  const promise = (async () => {
    const services = initFirebase();
    if (!services?.db) throw new Error('Community settings are unavailable. Please try again.');
    const ref = doc(services.db, 'users', expectedUid, 'consents', 'community');
    const existing = await getDocFromServer(ref);
    assertAccount(expectedUid);
    if (existing.exists() && existing.data()?.version === COMMUNITY_TERMS_VERSION) return true;
    if (!await askForAcceptance(expectedUid)) throw new Error('Sharing cancelled. You can continue exploring solo.');
    assertAccount(expectedUid);
    await setDoc(ref, {version: COMMUNITY_TERMS_VERSION, acceptedAt: serverTimestamp()});
    assertAccount(expectedUid);
    return true;
  })();
  pending = {uid: expectedUid, promise};
  try { return await promise; }
  finally { if (pending?.promise === promise) pending = null; }
}
