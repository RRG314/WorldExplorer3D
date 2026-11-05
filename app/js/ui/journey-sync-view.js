import { experienceById } from '../experiences/catalog.js';
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const summary = (title, value) =>
  `<article><span class="experience-eyebrow">${title}</span><strong>${escape(value?.name || 'Explorer')}</strong><p>${Number(value?.records) || 0} Journal records · ${Number(value?.homes) || 0} personal homes</p><small>${escape(experienceById(value?.focus)?.label || 'Free exploration')}</small></article>`;
export function createJourneySyncView({ onAction, onLayer = () => {} }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'journeySync';
  dialog.className = 'journey-sync';
  dialog.setAttribute('aria-labelledby', 'journeySyncTitle');
  document.body.append(dialog);
  let state = { status: 'checking', blocking: true },
    manual = false;
  function render() {
    const choosing = ['choose', 'conflict'].includes(state.status),
      recovering = state.status === 'recovery',
      working = ['checking', 'restoring', 'saving'].includes(state.status);
    dialog.setAttribute('aria-busy', String(working));
    dialog.dataset.blocking = String(state.blocking);
    dialog.innerHTML = `<header><div><span class="experience-eyebrow">WORLD EXPLORER</span><h2 id="journeySyncTitle">${recovering ? 'Recover your journey' : choosing ? 'One journey. Every device.' : 'Your account save'}</h2></div>${!state.blocking ? '<button data-sync-action="close" aria-label="Close account save">×</button>' : ''}</header><div class="journey-sync-body"><p role="status" aria-live="polite">${escape(state.message || 'Checking your saved journey…')}</p>${choosing ? `<div class="journey-save-choices">${summary('ON THIS DEVICE', state.local)}${summary('IN YOUR ACCOUNT', state.cloud?.summary)}</div><p>Keep your chosen career, discoveries, photographs, personal home and setup together. Account cars and shared property keep their existing ownership. The previous copy stays available for recovery.</p><div class="entry-actions">${state.cloud ? '<button data-sync-action="cloud">Continue account journey</button>' : ''}<button data-sync-action="device">${state.cloud ? 'Continue this device’s journey' : 'Save this journey to my account'}</button></div>` : ''}
  ${recovering ? `<div class="entry-actions"><button data-sync-action="finish"${state.canFinish === false ? ' disabled' : ''}>Finish restoring</button><button data-sync-action="rollback"${state.canRollback === false ? ' disabled' : ''}>Use previous device save</button></div>` : ''}
  ${state.status === 'error' ? `<p>Your device data is kept. Reconnect or try again before switching devices.</p><div class="entry-actions"><button data-sync-action="retry">Try account sync again</button>${state.previous ? '<button data-sync-action="previous">Recover previous account save</button>' : ''}<button data-sync-action="local">Continue on this device</button></div>` : ''}
  ${!state.blocking && !working ? `<div class="entry-actions">${state.ownerUid ? '<button data-sync-action="retry">Check & save now</button>' : ''}${state.previous ? '<button data-sync-action="previous">Restore previous account save</button>' : ''}<button data-sync-action="close">Continue exploring</button></div>` : ''}
  <a class="journey-sync-account-link" href="../account/">${state.ownerUid ? 'Your account' : 'Sign in / Account'}</a><small class="journey-sync-disclosure">Your personal account save is private. Guests can keep playing on this device. Signing in does not publish your Journal or turn personal records into verified competitive results.</small></div>`;
  }
  function update(next) {
    state = next;
    for (const label of document.querySelectorAll('[data-journey-sync-status]'))
      label.textContent = state.message || '';
    if (state.blocking && !dialog.open) {
      onLayer(true);
      dialog.showModal();
    }
    if (!state.blocking && !manual && dialog.open) {
      dialog.close();
      onLayer(false);
    }
    if (dialog.open) render();
  }
  function close() {
    if (state.blocking) return;
    manual = false;
    if (dialog.open) dialog.close();
    onLayer(false);
  }
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  dialog.addEventListener('click', (event) => {
    const action = event.target.closest('[data-sync-action]')?.dataset.syncAction;
    if (action === 'close') close();
    else if (action) void onAction(action);
  });
  return {
    update,
    open() {
      manual = true;
      if (!dialog.open) {
        onLayer(true);
        dialog.showModal();
      }
      render();
    },
    dispose() {
      dialog.close();
      dialog.remove();
      onLayer(false);
    },
  };
}
