import {
  captureJourneySnapshot,
  journeyLogicalDigest,
  hasPersonalJourney,
  createJourneyRestoreOwner,
  validateJourneyRestore,
} from './journey-snapshot.js';
import {
  journeySaveSummary,
  JOURNEY_LOCAL_KEYS,
  JOURNEY_FORMAT_VERSION,
} from './journey-format.js';
import { createJourneyCloudApi } from './journey-cloud-api.js';
const META_KEY = 'world-explorer:account-journey:v1';
const DEVICE_KEY = 'world-explorer:journey-device:v1';
const safeMeta = (storage) => {
  const raw = storage.getItem(META_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (value.schemaVersion !== 1)
    throw Error('Your account-save settings need a newer World Explorer. Your progress is kept.');
  return value;
};
const errorReason = (error) => error?.payload?.reason || error?.reason || error?.code || '';

// Transport coordination only. All gameplay reads/writes go through the
// original owners. Revision conflicts never merge linked items and currency.
export function createJourneySync({
  getOwnerUid,
  getStore,
  getBackpackStore,
  send,
  storage = localStorage,
  projectId,
  isPlaying = () => false,
  onState = () => {},
  beforeRestore = async () => {},
  reload = () => location.reload(),
  now = Date.now,
}) {
  let epoch = 0,
    owner = '',
    ownerKnown = false,
    binding = null,
    api = null,
    restoreOwner = null,
    store = null,
    backpackStore = null;
  let state = { status: 'checking', blocking: true },
    choice = null,
    running = null,
    timer = null,
    poll = null,
    disposed = false,
    dirty = false,
    dirtyVersion = 0,
    firstDirtyAt = 0,
    signature = null,
    lastAttemptAt = 0,
    retryFailures = 0;
  let clientId;
  try {
    clientId = storage.getItem(DEVICE_KEY);
  } catch {
    /* Device-only play remains available when metadata storage is denied. */
  }
  if (!clientId) {
    clientId = crypto.randomUUID();
    try {
      storage.setItem(DEVICE_KEY, clientId);
    } catch {
      /* Report persistence failure during association, without breaking app startup. */
    }
  }
  const publish = (next) => {
    state = { ...next, ownerUid: owner };
    onState({ ...state });
  };
  const writeBinding = (value) => {
    if (value === null) storage.removeItem(META_KEY);
    else storage.setItem(META_KEY, JSON.stringify(value));
    binding = value;
  };
  const current = (run) => !disposed && run === epoch && getOwnerUid() === owner;
  const guard = (run) => {
    if (!current(run))
      throw Object.assign(Error('Your account changed. Your saved progress is kept.'), {
        code: 'journey-owner-changed',
      });
  };
  const scope = (uid) => `${projectId}:${uid || 'guest'}:${uid ? 'account' : clientId}`;
  const capture = (uid) =>
    captureJourneySnapshot({ store, backpackStore, storage, ownerUid: uid || '' });
  const linked = () =>
    !!owner &&
    binding?.projectId === projectId &&
    binding?.ownerUid === owner &&
    Number.isSafeInteger(binding.baseRevision);
  const metadata = (manifest, logicalDigest) => ({
    schemaVersion: 1,
    projectId,
    ownerUid: owner,
    baseRevision: manifest.revision,
    logicalDigest,
    savedAtMs: manifest.updatedAtMs,
    upload: null,
  });
  async function prepare(run) {
    store = await getStore();
    guard(run);
    backpackStore = await getBackpackStore();
    guard(run);
    await backpackStore.ready;
    guard(run);
    restoreOwner = createJourneyRestoreOwner({
      store,
      backpackStore,
      storage,
      isCurrent: () => current(run),
      readBinding: () => binding,
      writeBinding,
      reload,
    });
    api = createJourneyCloudApi({ send, getOwnerUid: () => (current(run) ? owner : '') });
  }
  async function fresh(uid) {
    const { createMemoryDiscoveryProfileStore } = await import('../discovery/profile-store.js?v=5');
    return {
      schemaVersion: JOURNEY_FORMAT_VERSION,
      ownerUid: uid || '',
      journal: await createMemoryDiscoveryProfileStore().exportData(),
      receiptOutbox: [],
      deviceState: {
        backpack: null,
        local: Object.fromEntries(JOURNEY_LOCAL_KEYS.map((key) => [key, null])),
      },
    };
  }
  async function restore(envelope, nextBinding, run) {
    guard(run);
    publish({ status: 'restoring', blocking: true, message: 'Restoring your saved journey…' });
    await beforeRestore();
    guard(run);
    await restoreOwner.restore(envelope, nextBinding, { archiveKey: 'before-restore:' + clientId });
  }
  async function useCloud(head, run) {
    guard(run);
    choice = { head, run };
    const envelope = await api.download(owner, head.current);
    guard(run);
    return restore(envelope, metadata(head.current, await journeyLogicalDigest(envelope)), run);
  }
  function showChoice(head, envelope, run, status = 'choose') {
    choice = { head, envelope, run };
    publish({
      status,
      blocking: !(status === 'conflict' && linked() && isPlaying()),
      cloud: head.current,
      local: journeySaveSummary(envelope),
      message:
        status === 'conflict'
          ? 'Another device and this device both have new progress. Choose which journey to continue. Both copies will be kept for recovery.'
          : 'Choose the journey for this account. This browser’s existing history will not be added without your choice.',
    });
  }
  async function save(envelope, head, run, capturedVersion = dirtyVersion) {
    guard(run);
    if (!backpackStore.writable())
      throw Object.assign(
        Error(
          'Your Backpack is open in another tab. Close that tab and reopen World Explorer here to sync.'
        ),
        { code: 'journey-another-tab' }
      );
    await validateJourneyRestore(envelope, { store, ownerUid: owner });
    guard(run);
    const logicalDigest = await journeyLogicalDigest(envelope);
    guard(run);
    await store.writeJourneyRecovery('account:' + scope(owner), { envelope, binding });
    guard(run);
    publish({
      status: 'saving',
      blocking: false,
      message: 'Saved on this device · saving to your account…',
    });
    const prior =
      (binding?.ownerUid === owner && binding?.projectId === projectId ? binding.upload : null) ||
      (head.saving?.clientId === clientId
        ? { uploadId: head.saving.snapshotId, digest: head.saving.digest }
        : null);
    const manifest = await api.upload(owner, envelope, {
      expectedRevision: head.revision,
      clientId,
      priorUpload: prior,
      onPrepared: (upload) => {
        guard(run);
        writeBinding({
          schemaVersion: 1,
          projectId,
          ownerUid: owner,
          baseRevision: head.revision,
          logicalDigest: binding?.logicalDigest || '',
          savedAtMs: binding?.savedAtMs || 0,
          upload,
        });
      },
    });
    guard(run);
    writeBinding(metadata(manifest, logicalDigest));
    choice = null;
    dirty = dirtyVersion !== capturedVersion;
    firstDirtyAt = dirty ? now() : 0;
    retryFailures = 0;
    publish({
      status: dirty ? 'pending' : 'saved',
      blocking: false,
      previous: head.current || null,
      savedAtMs: manifest.updatedAtMs,
      message: dirty ? 'Saved on this device · more account sync pending' : 'Saved to your account',
    });
  }
  async function initialize(run, { immediate = false } = {}) {
    publish({
      status: 'checking',
      blocking: !(linked() && isPlaying()),
      message: 'Checking your saved journey…',
    });
    await prepare(run);
    guard(run);
    binding = safeMeta(storage);
    const pending = await restoreOwner.pending();
    guard(run);
    if (pending?.phase === 'prepared') {
      choice = { marker: pending, run };
      publish({
        status: 'recovery',
        blocking: true,
        canFinish: pending.target.ownerUid === owner,
        canRollback: pending.previousOwnerUid === owner,
        message:
          'Restoring a journey was interrupted. Finish restoring it or return to the previous device save. Both copies are kept. Sign into the matching account to use its recovery copy.',
      });
      return;
    }
    // Save the former owner before changing the browser's active Journal. An
    // account switch is never permission to upload that person's data elsewhere.
    const different =
      !!binding && (binding.projectId !== projectId || binding.ownerUid !== (owner || ''));
    if (different) {
      const source = await capture(binding.ownerUid || '');
      guard(run);
      await store.writeJourneyRecovery(
        'account:' +
          `${binding.projectId}:${binding.ownerUid || 'guest'}:${binding.ownerUid ? 'account' : clientId}`,
        { envelope: source, binding }
      );
      guard(run);
      const local = await store.readJourneyRecovery('account:' + scope(owner));
      guard(run);
      if (local?.envelope) return restore(local.envelope, local.binding, run);
      if (!owner) return restore(await fresh(''), null, run);
      // This account has no local copy. Keep the former user's archive private
      // and create its own empty device state before considering its cloud save.
      return restore(
        await fresh(owner),
        {
          schemaVersion: 1,
          projectId,
          ownerUid: owner,
          baseRevision: null,
          logicalDigest: '',
          upload: null,
        },
        run
      );
    }
    if (!owner) {
      publish({
        status: 'local',
        blocking: false,
        message: 'Saved on this device · sign in to continue on other devices',
      });
      return;
    }
    const envelope = await capture(owner),
      logicalDigest = await journeyLogicalDigest(envelope);
    guard(run);
    const head = await api.head(owner);
    guard(run);
    if (head.current?.logicalDigest === logicalDigest) {
      writeBinding(metadata(head.current, logicalDigest));
      dirty = false;
      publish({
        status: 'saved',
        blocking: false,
        previous: head.previous || null,
        savedAtMs: head.current.updatedAtMs,
        message: 'Saved to your account',
      });
      return;
    }
    if (!linked()) {
      if (head.current && !hasPersonalJourney(envelope)) return useCloud(head, run);
      showChoice(head, envelope, run);
      return;
    }
    if (head.revision !== binding.baseRevision) {
      if (head.current && logicalDigest === binding.logicalDigest && !isPlaying())
        return useCloud(head, run);
      showChoice(head, envelope, run, 'conflict');
      return;
    }
    if (logicalDigest !== binding.logicalDigest || binding.upload) {
      dirty = true;
      if (immediate) return save(envelope, head, run, dirtyVersion);
      publish({
        status: 'pending',
        blocking: false,
        message: 'Saved on this device · account sync pending',
      });
      schedule();
    } else
      publish({
        status: 'saved',
        blocking: false,
        previous: head.previous || null,
        savedAtMs: binding.savedAtMs,
        message: 'Saved to your account',
      });
  }
  async function handleFailure(error, run) {
    if (!current(run)) return;
    const pending = await restoreOwner?.pending().catch(() => null);
    if (!current(run)) return;
    if (pending?.phase === 'prepared') {
      choice = { marker: pending, run };
      publish({
        status: 'recovery',
        blocking: true,
        canFinish: pending.target.ownerUid === owner,
        canRollback: pending.previousOwnerUid === owner,
        message:
          'Restoring your journey was interrupted. Finish restoring it or return to the previous device save. Both copies are kept. Sign into the matching account to use its recovery copy.',
        detail: error.message,
      });
      return;
    }
    retryFailures++;
    if (errorReason(error) === 'journey_revision_changed') {
      publish({
        status: 'pending',
        blocking: false,
        message: 'Another device saved progress. Check your account save before continuing.',
      });
    } else {
      publish({
        status: 'error',
        blocking: !linked(),
        previous: choice?.head?.previous || null,
        message:
          error.code === 'journey-another-tab'
            ? error.message
            : 'Saved on this device. Your account save could not finish. Check your connection and try again.',
        detail: error.message,
      });
    }
  }
  async function check() {
    if (disposed || running) return running;
    const run = epoch;
    const task = initialize(run).catch((error) => handleFailure(error, run));
    running = task;
    return task.finally(() => {
      if (running === task) running = null;
    });
  }
  async function flush() {
    if (
      disposed ||
      running ||
      !linked() ||
      state.blocking ||
      ['choose', 'conflict', 'recovery'].includes(state.status) ||
      navigator.onLine === false
    )
      return;
    const run = epoch;
    lastAttemptAt = now();
    const task = (async () => {
      const capturedVersion = dirtyVersion,
        envelope = await capture(owner),
        hash = await journeyLogicalDigest(envelope);
      guard(run);
      if (hash === binding.logicalDigest && !binding.upload) {
        dirty = false;
        publish({
          status: 'saved',
          blocking: false,
          previous: state.previous || null,
          savedAtMs: binding.savedAtMs,
          message: 'Saved to your account',
        });
        return;
      }
      const head = await api.head(owner);
      guard(run);
      if (head.current?.logicalDigest === hash) {
        writeBinding(metadata(head.current, hash));
        dirty = false;
        publish({
          status: 'saved',
          blocking: false,
          previous: head.previous || null,
          savedAtMs: head.current.updatedAtMs,
          message: 'Saved to your account',
        });
        return;
      }
      if (head.revision !== binding.baseRevision) {
        showChoice(head, envelope, run, 'conflict');
        return;
      }
      await save(envelope, head, run, capturedVersion);
    })().catch((error) => handleFailure(error, run));
    running = task;
    return task.finally(() => {
      if (running === task) running = null;
      if (dirty && !state.blocking && retryFailures < 5)
        schedule(Math.min(300000, 30000 * 2 ** retryFailures));
    });
  }
  function schedule(delay = 5000) {
    clearTimeout(timer);
    if (!disposed && retryFailures < 5)
      timer = setTimeout(
        () => void flush(),
        Math.max(
          0,
          retryFailures
            ? delay
            : Math.min(delay, firstDirtyAt ? 30000 - (now() - firstDirtyAt) : delay),
          30000 - (now() - lastAttemptAt)
        )
      );
  }
  function markDirty() {
    if (!dirty) firstDirtyAt = now();
    dirty = true;
    dirtyVersion++;
    if (linked() && !state.blocking) {
      if (state.status === 'saved')
        publish({
          status: 'pending',
          blocking: false,
          message: 'Saved on this device · account sync pending',
        });
      schedule();
    }
  }
  async function ownerChanged() {
    const next = getOwnerUid() || '';
    if (disposed || (next === owner && ownerKnown)) return;
    ownerKnown = true;
    epoch++;
    owner = next;
    clearTimeout(timer);
    running = null;
    choice = null;
    retryFailures = 0;
    return check();
  }
  async function act(action) {
    if (disposed || running) return;
    const run = epoch;
    const task = (async () => {
      guard(run);
      if (action === 'retry') {
        retryFailures = 0;
        return initialize(run, { immediate: true });
      }
      if (action === 'local') {
        if (
          binding &&
          (binding.projectId !== projectId || (binding.ownerUid && binding.ownerUid !== owner))
        )
          throw Error('Switch to this account’s own save before playing.');
        publish({
          status: linked() ? 'pending' : 'local-unassociated',
          blocking: false,
          message: linked()
            ? 'Saved on this device · account sync pending'
            : 'Saved on this device · choose your account save when connected',
        });
        return;
      }
      if (action === 'previous') {
        const head = await api.head(owner);
        guard(run);
        if (!head.previous) throw Error('There is no previous account save to restore.');
        const envelope = await api.download(owner, head.previous);
        guard(run);
        return restore(
          envelope,
          { ...metadata(head.previous, ''), baseRevision: head.revision },
          run
        );
      }
      if (choice?.run !== run) return;
      if (action === 'cloud' && choice.head?.current) return useCloud(choice.head, run);
      if (action === 'device' && choice.envelope) {
        guard(run);
        const capturedVersion = dirtyVersion,
          envelope = await capture(owner),
          head = await api.head(owner);
        guard(run);
        if (head.revision !== choice.head.revision) {
          showChoice(head, envelope, run, 'conflict');
          return;
        }
        const wasLinked = linked();
        await save(envelope, head, run, capturedVersion);
        if (!wasLinked) {
          guard(run);
          reload();
        }
      }
      if (action === 'finish' && choice.marker) {
        if (choice.marker.target.ownerUid !== owner)
          throw Error(
            'Sign into the account that owns this interrupted restore, or choose the previous device save.'
          );
        return restoreOwner.finish(choice.marker);
      }
      if (action === 'rollback' && choice.marker)
        return restoreOwner.rollback(choice.marker, { ownerUid: owner });
    })().catch((error) => handleFailure(error, run));
    running = task;
    return task.finally(() => {
      if (running === task) running = null;
    });
  }
  function start() {
    globalThis.addEventListener?.('we3d:journal-saved', markDirty);
    globalThis.addEventListener?.('online', onOnline);
    poll = setInterval(() => {
      if (disposed || !ownerKnown) return;
      if ((getOwnerUid() || '') !== owner) {
        void ownerChanged();
        return;
      }
      try {
        const next = [
          ...JOURNEY_LOCAL_KEYS,
          'world-explorer:character-backpack:v3',
          'world-explorer:backpack-controls:v2',
        ].map((key) => storage.getItem(key));
        if (signature && next.some((value, index) => value !== signature[index])) markDirty();
        signature = next;
      } catch {
        /* The next explicit sync reports storage failure. */
      }
    }, 10000);
  }
  const onOnline = () => {
    retryFailures = 0;
    if (!state.blocking && linked()) schedule(1000);
    else if (state.status !== 'local-unassociated') void check();
  };
  return Object.freeze({
    start,
    ownerChanged,
    act,
    flush,
    check,
    markDirty,
    snapshot: () => ({ ...state }),
    canPlay: () => !state.blocking,
    dispose() {
      disposed = true;
      epoch++;
      clearTimeout(timer);
      clearInterval(poll);
      globalThis.removeEventListener?.('we3d:journal-saved', markDirty);
      globalThis.removeEventListener?.('online', onOnline);
    },
  });
}
