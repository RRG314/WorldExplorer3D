import { hasFirebaseConfig } from '../../js/firebase-init.js?v=55';
import {
  observeAuth,
  requestPasswordReset,
  signInWithEmailPassword,
  signInWithGoogle,
  signOutUser,
  signUpWithEmailPassword
} from '../../js/auth-ui.js?v=55';
import {
  ensureEntitlements,
  getFreeEntitlementsState,
  subscribeEntitlements
} from '../../js/entitlements.js?v=71';

const appSignInBtn = document.getElementById('appSignInBtn');
const proAccessPanel = document.getElementById('proAccessPanel');
const proAccessState = document.getElementById('proAccessState');
const proAccessStatus = document.getElementById('proAccessStatus');
const upgradeFromAppBtn = document.getElementById('upgradeFromAppBtn');
const authFloatPanel = document.getElementById('authFloatPanel');
const authModeSignInBtn = document.getElementById('authModeSignInBtn');
const authModeSignUpBtn = document.getElementById('authModeSignUpBtn');
const authDisplayNameRow = document.getElementById('authDisplayNameRow');
const authDisplayNameInput = document.getElementById('authDisplayNameInput');
const authEmailInput = document.getElementById('authEmailInput');
const authPasswordInput = document.getElementById('authPasswordInput');
const authConfirmRow = document.getElementById('authConfirmRow');
const authConfirmPasswordInput = document.getElementById('authConfirmPasswordInput');
const authFormBlock = document.getElementById('authFormBlock');
const authSignedInBlock = document.getElementById('authSignedInBlock');
const authUserSummary = document.getElementById('authUserSummary');
const authAccountBtn = document.getElementById('authAccountBtn');
const authSignOutBtn = document.getElementById('authSignOutBtn');
const authEmailSubmitBtn = document.getElementById('authEmailSubmitBtn');
const authGoogleBtn = document.getElementById('authGoogleBtn');
const authForgotBtn = document.getElementById('authForgotBtn');
const authPanelStatus = document.getElementById('authPanelStatus');

let unsubscribeEntitlements = null;
let currentState = getFreeEntitlementsState();
let authMode = 'signin';
let proPanelAutoHideTimer = null;
const PRO_PANEL_AUTO_HIDE_MS = 2000;

function setProStatus(message, isWarn = false) {
  proAccessStatus.textContent = message || '';
  proAccessStatus.style.color = isWarn ? '#fca5a5' : '#93c5fd';
}

function setAuthStatus(message, isWarn = false) {
  authPanelStatus.textContent = message || '';
  authPanelStatus.style.color = isWarn ? '#fca5a5' : '#93c5fd';
}

function scheduleProPanelAutoHide() {
  if (proPanelAutoHideTimer) {
    clearTimeout(proPanelAutoHideTimer);
    proPanelAutoHideTimer = null;
  }

  const touchLayout = (navigator.maxTouchPoints || 0) > 0 ||
    window.matchMedia?.('(pointer: coarse)').matches;
  if (touchLayout) {
    proAccessPanel.hidden = true;
    return;
  }

  proAccessPanel.hidden = false;
  proPanelAutoHideTimer = window.setTimeout(() => {
    proAccessPanel.hidden = true;
    proPanelAutoHideTimer = null;
  }, PRO_PANEL_AUTO_HIDE_MS);
}

function setAuthMode(mode) {
  authMode = mode === 'signup' ? 'signup' : 'signin';
  const isSignUp = authMode === 'signup';

  authModeSignInBtn.classList.toggle('active', !isSignUp);
  authModeSignUpBtn.classList.toggle('active', isSignUp);
  authDisplayNameRow.hidden = !isSignUp;
  authConfirmRow.hidden = !isSignUp;
  authForgotBtn.style.display = isSignUp ? 'none' : 'inline-flex';
  authEmailSubmitBtn.textContent = isSignUp ? 'Create Account' : 'Sign In With Email';
  authPasswordInput.autocomplete = isSignUp ? 'new-password' : 'current-password';
}

function isTitleScreenVisible() {
  const titleScreen = document.getElementById('titleScreen');
  return !!(titleScreen && !titleScreen.classList.contains('hidden'));
}

function updateAuthOverlayVisibility() {
  const titleVisible = isTitleScreenVisible();
  appSignInBtn.hidden = !titleVisible;
  if (!titleVisible) {
    closeAuthPanel();
  }
}

function openAuthPanel() {
  authFloatPanel.hidden = false;
  appSignInBtn.setAttribute('aria-expanded', 'true');
}

function closeAuthPanel() {
  authFloatPanel.hidden = true;
  appSignInBtn.setAttribute('aria-expanded', 'false');
  setAuthStatus('');
}

function toggleAuthPanel() {
  if (authFloatPanel.hidden) {
    openAuthPanel();
  } else {
    closeAuthPanel();
  }
}

function setAuthBusy(busy) {
  authEmailSubmitBtn.disabled = busy;
  authGoogleBtn.disabled = busy;
  authForgotBtn.disabled = busy;
  authModeSignInBtn.disabled = busy;
  authModeSignUpBtn.disabled = busy;
}

function readAuthFields() {
  return {
    email: String(authEmailInput.value || '').trim(),
    password: String(authPasswordInput.value || ''),
    confirmPassword: String(authConfirmPasswordInput.value || ''),
    displayName: String(authDisplayNameInput.value || '').trim()
  };
}

function renderState(state, user) {
  currentState = state || getFreeEntitlementsState();

  const plan = currentState.plan || 'free';
  const adminMode = currentState.isAdmin === true || currentState.subscriptionStatus === 'admin';

  const signedIn = !!user;
  appSignInBtn.textContent = signedIn ? 'Account' : 'Sign In / Sign Up';
  authFormBlock.hidden = signedIn;
  authSignedInBlock.hidden = !signedIn;
  if (signedIn) {
    const summaryName = user.displayName || user.email || 'Signed In';
    authUserSummary.textContent = `${summaryName} • ${(currentState.planLabel || 'Free')}`;
  } else {
    authUserSummary.textContent = '';
  }

  const isPro = adminMode || plan === 'pro';
  scheduleProPanelAutoHide();
  proAccessState.textContent = isPro ? 'Donation Recognition' : 'Open Access';
  upgradeFromAppBtn.style.display = isPro ? 'none' : 'inline-flex';

  if (adminMode) {
    setProStatus('Admin test mode active. Core play, map access, and multiplayer remain open to everyone.');
  } else if (isPro) {
    setProStatus('Pro donation recognition active. Core play, map access, and multiplayer remain open to everyone.');
  } else if (plan === 'supporter') {
    setProStatus('Supporter donation recognition active. Core play, map access, and multiplayer remain open to everyone.');
  } else {
    setProStatus('All core play, M map access, and signed-in multiplayer are free. Donations are optional.');
  }

  updateAuthOverlayVisibility();
}

function clearEntitlementSubscription() {
  if (unsubscribeEntitlements) {
    unsubscribeEntitlements();
    unsubscribeEntitlements = null;
  }
}

async function applySignedOutState() {
  clearEntitlementSubscription();
  renderState(getFreeEntitlementsState(), null);
}

async function applySignedInState(user) {
  const state = await ensureEntitlements(user);
  renderState(state, user);
  clearEntitlementSubscription();
  unsubscribeEntitlements = subscribeEntitlements(user, (nextState) => {
    renderState(nextState, user);
  });
}

appSignInBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleAuthPanel();
});

authModeSignInBtn.addEventListener('click', () => setAuthMode('signin'));
authModeSignUpBtn.addEventListener('click', () => setAuthMode('signup'));

authEmailSubmitBtn.addEventListener('click', async () => {
  const { email, password, confirmPassword, displayName } = readAuthFields();
  if (!email) {
    setAuthStatus('Email is required.', true);
    return;
  }
  if (!password) {
    setAuthStatus('Password is required.', true);
    return;
  }
  if (authMode === 'signup' && password !== confirmPassword) {
    setAuthStatus('Passwords do not match.', true);
    return;
  }

  setAuthBusy(true);
  setAuthStatus(authMode === 'signup' ? 'Creating account...' : 'Signing in...');
  try {
    const user = authMode === 'signup'
      ? await signUpWithEmailPassword(email, password, displayName)
      : await signInWithEmailPassword(email, password);
    await applySignedInState(user);
    setAuthStatus('Signed in successfully.');
    closeAuthPanel();
  } catch (err) {
    console.error('[app] email auth failed:', err);
    setAuthStatus(err && err.message ? err.message : 'Authentication failed.', true);
  } finally {
    setAuthBusy(false);
  }
});

authGoogleBtn.addEventListener('click', async () => {
  setAuthBusy(true);
  setAuthStatus('Starting Google sign-in...');
  try {
    const user = await signInWithGoogle();
    if (!user) {
      setAuthStatus('Continue in popup/redirect to complete Google sign-in.');
      return;
    }
    await applySignedInState(user);
    closeAuthPanel();
  } catch (err) {
    console.error('[app] google sign-in failed:', err);
    setAuthStatus(err && err.message ? err.message : 'Google sign-in failed.', true);
  } finally {
    setAuthBusy(false);
  }
});

authForgotBtn.addEventListener('click', async () => {
  const email = String(authEmailInput.value || '').trim();
  if (!email) {
    setAuthStatus('Enter your email first, then click Forgot password.', true);
    return;
  }
  setAuthBusy(true);
  setAuthStatus('Sending reset email...');
  try {
    await requestPasswordReset(email);
    setAuthStatus('Password reset email sent.');
  } catch (err) {
    console.error('[app] password reset failed:', err);
    setAuthStatus(err && err.message ? err.message : 'Could not send reset email.', true);
  } finally {
    setAuthBusy(false);
  }
});

document.addEventListener('pointerdown', (event) => {
  if (appSignInBtn.hidden || authFloatPanel.hidden) return;
  const target = event.target;
  if (target === appSignInBtn || authFloatPanel.contains(target)) return;
  closeAuthPanel();
}, true);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeAuthPanel();
  }
});

authSignOutBtn.addEventListener('click', async () => {
  try {
    await signOutUser();
    await applySignedOutState();
    closeAuthPanel();
  } catch (err) {
    console.error('[app] sign-out failed:', err);
    setProStatus('Could not sign out.', true);
  }
});

authAccountBtn.addEventListener('click', () => {
  window.location.assign('../account/');
});

upgradeFromAppBtn.addEventListener('click', () => {
  window.location.assign('../account/');
});

if (!hasFirebaseConfig()) {
  setProStatus('Missing Firebase config. App runs in free mode until config is provided.', true);
  setAuthStatus('Missing Firebase config. Auth is disabled until config loads.', true);
}

if (new URLSearchParams(window.location.search).get('startTrial') === '1') {
  const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
  window.history.replaceState({}, '', cleanUrl);
  setAuthStatus('Sign in to use multiplayer. Donations are optional in Account.');
}

observeAuth(async (user) => {
  if (!user) {
    await applySignedOutState();
    return;
  }

  try {
    await applySignedInState(user);
  } catch (err) {
    console.error('[app] failed to load entitlements:', err);
    setProStatus('Failed to load account plan. Using local free mode.', true);
    renderState(getFreeEntitlementsState(), null);
  }
});

setAuthMode('signin');
updateAuthOverlayVisibility();

const titleScreenObserverTarget = document.getElementById('titleScreen');
if (titleScreenObserverTarget) {
  const titleObserver = new MutationObserver(() => updateAuthOverlayVisibility());
  titleObserver.observe(titleScreenObserverTarget, { attributes: true, attributeFilter: ['class'] });
}
