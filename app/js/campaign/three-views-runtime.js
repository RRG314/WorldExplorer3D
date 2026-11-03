import {prepareDocumentaryMedia} from './documentary-media.js';
import {documentaryStory,documentarySelected} from './documentary-story.js';
import {documentaryEditorMarkup,documentaryStoryHtml} from './documentary-ui.js';
import { attachThreeViewsHome, disposeThreeViewsHome, homeAlbumPlacement } from './three-views-home.js';
import { normalizeThreeViews, emptyPhotoAlbum, validateView, THREE_VIEWS } from './three-views.js';
import { createWorldPhotoCapture, inspectPhotoSubject, photoAlbumHtml } from './three-views-capture.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={context:'Street view',detail:'Facade detail',setting:'District setting'};

export function createThreeViewsRuntime(state) {
  const ctx = state.appCtx,
    store = state.profileStore,
    element = document.getElementById('discoveryThreeViews'),
    abort = new AbortController();
  const camera = createWorldPhotoCapture(ctx);
  const reticle = document.createElement('div');
  reticle.className = 'discoveryCameraReticle';
  reticle.setAttribute('aria-hidden', 'true');
  reticle.hidden = true;
  document.body.append(reticle);
  let career = null,
    storyValues = null,
    pendingStory = null;
  let displayHost = null,
    displayKey = null,
    displayGroup = null,
    renderKey = '';
  let job = normalizeThreeViews(),
    album = emptyPhotoAlbum(),
    started = false,
    busy = false,
    disposed = false,
    message = '',
    armed = null,
    candidate = null,
    confirmDelete = false,
    hydration = 0,
    loadedKey = '';
  const mediaKey = (value) =>
    JSON.stringify([
      value.schemaVersion,
      value.revision,
      value.displayHomeId,
      value.mediaDeleted,
      value.subject?.id,
      (value.views || []).map((v) => [v.kind, v.fingerprint]),
    ]);
  const identity = () => ({
    regionId: state.worldIdentityId,
    regionLabel: state.regionLabel,
    locationSnapshot: { lat: ctx.LOC.lat, lon: ctx.LOC.lon, name: state.regionLabel },
  });
  const here = () =>
    ctx.getEnv?.() === 'EARTH' &&
    !ctx.worldLoading &&
    !ctx.activeInterior &&
    ctx.getCurrentTravelMode?.() === 'walk' &&
    !ctx.getLiveGpsSnapshot?.().active &&
    (job.phase === 'available' || job.regionId === state.worldIdentityId);
  const button = (action, label) =>
    `<button type="button" data-photo-action="${action}"${busy ? ' disabled' : ''}>${escape(label)}</button>`;
  function render() {
    if (disposed || !element) return;
    const key = JSON.stringify([
      mediaKey(job),
      job.phase,
      job.displayHomeId,
      started,
      busy,
      message,
      confirmDelete,
      here(),
      ctx.activeInterior?.ownedHome?.id,
      album.photos.length,
      candidate?.view,
      career?.variantId,
      job.story,
      !!pendingStory,
    ]);
    if (key === renderKey) return;
    renderKey = key;
    if (career?.variantId === 'field-story') {
      element.setAttribute('aria-busy', String(busy));
      element.innerHTML = `<span class="discoveryChapterEyebrow">FROM THE HARBOR · DOCUMENTARY</span><strong>Read the Street${job.story?.phase === 'complete' ? ' · Complete' : ''}</strong>${button('next', 'Activities · documentary assignments')}${documentaryEditorMarkup({ base: job, album, busy, pending: pendingStory, values: storyValues, button })}<p role="status">${escape(message)}</p><small>${store.type === 'IndexedDbDiscoveryProfileStore' ? 'Saved on this device' : 'Session only · export your Journal before leaving'}</small>`;
      return;
    }
    const phase = job.schemaVersion === 1 ? job.phase : 'unavailable';
    const text =
      phase === 'unavailable'
        ? 'This album needs a newer version of World Explorer.'
        : !started
          ? 'Finish First Bearings to open this optional Explorer job.'
          : phase === 'available'
            ? 'Pick a mapped building and tell its story in three views. Keep an album of in-game photographs, or make an observation record without saving images.'
            : phase === 'choose'
              ? 'Look at a building from the street. Center it on screen, then choose it with the interaction button.'
              : phase === 'framing'
                ? `Your subject: ${job.subject.name}. Start with the street view, move closer for a facade detail, then find a wider view from another angle.`
                : phase === 'review'
                  ? 'Review your three views, then save the finished record. You can retake a view before finishing.'
                  : job.mediaDeleted
                    ? 'Photographs deleted. Your completion record and badge are kept.'
                    : job.mode === 'photo'
                      ? 'Your album is saved on this device. Export it to keep a separate copy.'
                      : 'Three observations saved. This record contains no photographs.';
    let actions = career ? button('next', 'Activities · documentary assignments') : '';
    if (started && phase === 'available')
      actions +=
        button('accept:photo', 'Start a photo album') +
        button('accept:observation', 'Use observations');
    if (phase === 'choose') actions += button('aim', 'Choose in the world');
    if (phase === 'framing' && !candidate)
      actions += THREE_VIEWS.kinds
        .filter(
          (k) =>
            !job.views.some((v) => v.kind === k) &&
            (k === 'context' || job.views.some((v) => v.kind === 'context'))
        )
        .map((k) => button(`arm:${k}`, `Frame ${names[k].toLowerCase()}`))
        .join('');
    if (candidate)
      actions +=
        `<figure class="discoveryPhotoPreview">${candidate.photo ? `<img src="${candidate.photo.dataUrl}" alt="Preview of ${escape(names[candidate.view.kind])}">` : ''}<figcaption>${escape(names[candidate.view.kind])} · ${Math.round(candidate.view.range)}${candidate.view.rangeUnits === 'm' ? ' m' : ' recorded range'} from the facade${job.mode === 'observation' ? ' · observation only' : ''}</figcaption></figure>` +
        button('keep', 'Keep this view') +
        button('retake', 'Try again');
    if (phase === 'review') actions += button('finish', 'Finish and save record');
    const views = (job.views || [])
      .map((view) => {
        const photo = album.photos.find((p) => p.kind === view.kind);
        return `<figure>${photo ? `<img src="${photo.dataUrl}" alt="${escape(names[view.kind])} of ${escape(job.subject.name)}" loading="lazy">` : ''}<figcaption>${escape(names[view.kind])} · ${Math.round(view.range)}${view.rangeUnits === 'm' ? ' m' : ' recorded range'}${photo ? '' : job.mode === 'observation' ? ' · observation record' : ' · image deleted'}</figcaption>${['framing', 'review'].includes(phase) ? button(`remove:${view.kind}`, 'Retake this view') : ''}</figure>`;
      })
      .join('');
    if (phase === 'complete' && !job.mediaDeleted && homeAlbumPlacement(ctx.activeInterior))
      actions += button('display', 'Display in this home');
    if (phase === 'complete' && album.photos.length)
      actions += button('export', 'Export album') + button('delete', 'Delete photographs');
    if (confirmDelete)
      actions += `<p>Delete all three images from this device? Export a copy first if you want to keep them.</p>${button('confirm-delete', 'Delete the three images')}${button('cancel-delete', 'Keep images')}`;
    if (['choose', 'framing', 'review'].includes(phase))
      actions += button('continue', 'Continue later') + button('leave', 'Discard unfinished album');
    element.dataset.photoPhase = phase;
    element.setAttribute('aria-busy', String(busy));
    element.innerHTML = `<span class="discoveryChapterEyebrow">FROM THE HARBOR · EXPLORER</span><strong>A Place in Three Views${phase === 'complete' ? ' · Complete' : ''}</strong><p>${escape(text)}</p>${!here() && started && phase !== 'complete' ? '<p>Continue outdoors on foot in the accepted region, with Live GPS off.</p>' : ''}<div class="discoveryPhotoActions">${actions}</div>${views ? `<div class="discoveryPhotoAlbum">${views}</div>` : ''}<small role="status">${store.type === 'IndexedDbDiscoveryProfileStore' ? 'Saved on this device' : 'Session only · export your Journal before leaving'}${message ? ` · ${escape(message)}` : ''}</small>`;
  }
  async function refresh(provided) {
    const seq = ++hydration;
    try {
      let profile = provided || (await store.getProfile());
      if (disposed || seq !== hydration) return;
      if (provided && profile.threeViews?.revision < job.revision)
        profile = await store.getProfile();
      if (disposed || seq !== hydration) return;
      const next = normalizeThreeViews(profile.threeViews);
      if (mediaKey(next) !== loadedKey) {
        const images = await store.getThreeViewsAlbum();
        if (disposed || seq !== hydration) return;
        album = images;
        loadedKey = mediaKey(next);
        candidate = null;
        armed = null;
      }
      job = next;
      started =
        profile.openingChapter?.phase === 'complete' ||
        documentarySelected(profile) ||
        job.phase === 'complete';
      if (message.startsWith('The album could not refresh.')) message = '';
      update();
      render();
    } catch {
      if (!disposed) {
        message = 'The album could not refresh. Reopen the Journal to retry; saved views are kept.';
        render();
      }
    }
  }
  async function save(command) {
    const result = await store.updateThreeViews({ ...command, revision: job.revision });
    if (disposed) return;
    hydration++;
    job = result.state;
    album = result.album;
    loadedKey = mediaKey(job);
    candidate = null;
    message = '';
    update();
    if (command.type === 'delete-photos') await state.ui?.refreshData();
  }
  const storySaveMessage = (error) =>
    error?.name === 'QuotaExceededError'
      ? 'There is not enough device storage to save this story. Your original album is kept. Free space, then retry the same draft.'
      : ['AbortError', 'InvalidStateError', 'UnknownError', 'TransactionInactiveError'].includes(
            error?.name
          )
        ? 'The story could not save. Your last saved draft and photographs are kept. Retry when this device is ready.'
        : error?.message || 'The story could not save. Retry the same draft.';
  async function saveStory(command) {
    pendingStory = { ...command, revision: job.revision };
    try {
      const result = await store.updateThreeViews(pendingStory);
      if (disposed) return;
      hydration++;
      job = result.state;
      album = result.album;
      loadedKey = mediaKey(job);
      pendingStory = null;
      storyValues = null;
      message = '';
    } catch (error) {
      if (!disposed) message = storySaveMessage(error);
    }
  }
  async function act(action, payload = {}) {
    if (disposed || busy) return;
    busy = true;
    message = '';
    render();
    try {
      if (action === 'next') {
        career?.onNext?.();
        return;
      }
      if (action === 'journal') {
        ctx.openWorldDiscoverySection?.('journal');
        return;
      }
      if (action === 'story-export') {
        await prepareDocumentaryMedia(job, album);
        const url = URL.createObjectURL(
            new Blob([documentaryStoryHtml(job, album)], { type: 'text/html' })
          ),
          a = document.createElement('a');
        a.href = url;
        a.download = 'world-explorer-field-story.html';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      if (action === 'story-reload') {
        pendingStory = null;
        storyValues = null;
        await refresh();
        return;
      }
      if (action === 'story-retry') {
        if (!pendingStory) throw Error('No story save is waiting.');
        const command = pendingStory;
        const result = await store.updateThreeViews(command);
        if (disposed) return;
        hydration++;
        job = result.state;
        album = result.album;
        loadedKey = mediaKey(job);
        pendingStory = null;
        storyValues = null;
        message = '';
        return;
      }
      if (action === 'story-edit') {
        const s = documentaryStory(job);
        await saveStory({
          type: 'story-draft',
          title: s.title,
          question: s.question,
          captions: s.captions,
          conclusion: s.conclusion,
        });
        return;
      }
      if (action.startsWith('story-')) {
        await saveStory({ type: action, ...payload });
        if (job.story?.phase === 'complete') await state.ui?.refreshData();
        return;
      }
      if (action.startsWith('accept:')) {
        if (!here()) throw Error('Start outdoors on foot with Live GPS off.');
        await save({ type: 'accept', mode: action.split(':')[1], ...identity() });
        if (!disposed) {
          armed = 'choose';
          state.ui?.setOpen(false);
          ctx.showToast?.(
            'Center a building on screen, then choose it with the interaction button.'
          );
        }
      } else if (action === 'aim' || action.startsWith('arm:')) {
        if (!here()) throw Error('Return to your accepted region, outdoors on foot.');
        armed = action === 'aim' ? 'choose' : action.split(':')[1];
        candidate = null;
        state.ui?.setOpen(false);
        ctx.showToast?.(
          armed === 'choose'
            ? 'Center a building on screen, then choose it.'
            : `Frame the ${names[armed]?.toLowerCase()}; use the interaction button to ${job.mode === 'photo' ? 'take a photograph' : 'record the view'}.`
        );
      } else if (action === 'shutter') {
        if (!here() || !armed) throw Error('Frame your subject outdoors on foot.');
        if (armed === 'choose') {
          const { subject } = inspectPhotoSubject(ctx, identity());
          await save({ type: 'choose', subject });
          armed = 'context';
          ctx.showToast?.(
            `${subject.name} selected. Step back to show the street, then take your first view.`
          );
        } else {
          const lease = career;
          const kind = armed,
            revision = job.revision,
            inspect = () => inspectPhotoSubject(ctx, identity(), job.subject.id);
          const result =
            job.mode === 'photo'
              ? await camera.capture(kind, inspect)
              : { view: { ...inspect().view, kind } };
          if (disposed || (lease && (career !== lease || !lease.isActive()))) return;
          if (job.revision !== revision)
            throw Error('The job changed while you were framing. Reopen it to continue.');
          validateView(job, result.view);
          candidate = result;
          armed = null;
          ctx.openWorldDiscoverySection?.('today');
        }
      } else if (action === 'keep') {
        if (!candidate) throw Error('Take a view first.');
        await save({ type: 'keep', ...candidate });
      } else if (action === 'retake') {
        armed = candidate?.view.kind || 'context';
        candidate = null;
        state.ui?.setOpen(false);
      } else if (action.startsWith('remove:'))
        await save({ type: 'remove', kind: action.split(':')[1] });
      else if (action === 'finish') {
        await save({ type: 'finish' });
        ctx.showToast?.('Three-view Explorer badge earned');
        await state.ui?.refreshData();
      } else if (action === 'continue') {
        armed = null;
        state.ui?.setOpen(false);
        ctx.showToast?.('Camera put away. Your saved views are kept in Today.');
      } else if (action === 'leave') {
        await save({ type: 'abandon' });
        armed = null;
      } else if (action === 'display') {
        if (!homeAlbumPlacement(ctx.activeInterior))
          throw Error('Enter an owned home with a clear wall to hang this record.');
        await save({ type: 'display', homeId: ctx.activeInterior.ownedHome.id });
      } else if (action === 'delete') confirmDelete = true;
      else if (action === 'cancel-delete') confirmDelete = false;
      else if (action === 'confirm-delete') {
        await save({ type: 'delete-photos' });
        confirmDelete = false;
      } else if (action === 'export') {
        const blob = new Blob([photoAlbumHtml(job, album)], { type: 'text/html' }),
          url = URL.createObjectURL(blob),
          a = document.createElement('a');
        a.href = url;
        a.download = 'world-explorer-three-views.html';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      if (!disposed) {
        message = action.startsWith('story-')
          ? storySaveMessage(error)
          : error.message || 'The view could not be saved. Try again.';
        ctx.showToast?.(message);
        ctx.openWorldDiscoverySection?.('today');
      }
    } finally {
      busy = false;
      render();
    }
  }
  element?.addEventListener(
    'click',
    (event) => {
      const b = event.target.closest('[data-photo-action]');
      if (b) void act(b.dataset.photoAction);
    },
    { signal: abort.signal }
  );
  element?.addEventListener(
    'input',
    (event) => {
      const form = event.target.closest('[data-documentary-form]');
      if (!form || busy || pendingStory) return;
      const data = new FormData(form);
      storyValues =
        form.dataset.documentaryForm === 'story-select'
          ? { order: [0, 1, 2].map((i) => String(data.get('order-' + i))) }
          : {
              title: String(data.get('title') || ''),
              question: String(data.get('question') || ''),
              captions: Object.fromEntries(
                THREE_VIEWS.kinds.map((k) => [k, String(data.get('caption-' + k) || '')])
              ),
              conclusion: String(data.get('conclusion') || ''),
            };
    },
    { signal: abort.signal }
  );
  element?.addEventListener(
    'submit',
    (event) => {
      const form = event.target.closest('[data-documentary-form]');
      if (!form) return;
      event.preventDefault();
      if (busy) return;
      const data = new FormData(form),
        action = event.submitter?.dataset.storySubmit || form.dataset.documentaryForm;
      const payload =
        action === 'story-select'
          ? { order: [0, 1, 2].map((i) => String(data.get('order-' + i))) }
          : {
              title: String(data.get('title') || ''),
              question: String(data.get('question') || ''),
              ...(action === 'story-draft' || action === 'story-review'
                ? {
                    captions: Object.fromEntries(
                      THREE_VIEWS.kinds.map((k) => [k, String(data.get('caption-' + k) || '')])
                    ),
                    conclusion: String(data.get('conclusion') || ''),
                  }
                : {}),
            };
      storyValues = payload;
      void act(action, payload);
    },
    { signal: abort.signal }
  );
  const unregister = ctx.registerContextInteraction?.({
    id: 'three_views_camera',
    priority: 98,
    evaluate: () =>
      !disposed && !busy && armed && here() && !state.ui?.open
        ? {
            available: true,
            label:
              armed === 'choose'
                ? 'Choose building'
                : job.mode === 'photo'
                  ? 'Take photograph'
                  : 'Record view',
            detail: armed === 'choose' ? 'Center the building on screen' : names[armed],
            distance: 0,
          }
        : null,
    perform: () => act('shutter').then(() => true),
  });
  void refresh();
  function update() {
    const hidden = !armed || !!state.ui?.open || !here() || !!ctx.paused;
    if (reticle.hidden !== hidden) reticle.hidden = hidden;
    const active = ctx.activeInterior || null;
    if (displayHost === active && displayGroup === active?.group && displayKey === loadedKey)
      return;
    disposeThreeViewsHome(displayHost);
    displayHost = active;
    displayGroup = active?.group;
    displayKey = loadedKey;
    if (active) {
      const revision = job.revision;
      void attachThreeViewsHome(active, job, album).then((attached) => {
        if (
          !attached &&
          !disposed &&
          displayHost === active &&
          job.revision === revision &&
          job.displayHomeId === active.ownedHome?.id &&
          !job.mediaDeleted
        ) {
          message =
            'This room could not show the display. Your album is safe; try another clear room.';
          render();
        }
      });
    }
    render();
  }
  return {
    refresh,
    update,
    async startCareer(options) {
      career = options;
      await refresh();
      if (disposed || career !== options || !options.isActive()) return false;
      if (job.schemaVersion !== 1 || documentaryStory(job).schemaVersion !== 1)
        throw Error('This saved album needs a newer version of World Explorer.');
      if (
        options.variantId === 'field-story' &&
        (job.phase !== 'complete' ||
          job.mode !== 'photo' ||
          (job.mediaDeleted && job.story?.phase !== 'complete'))
      )
        throw Error('Complete the three-view photo album before editing its story.');
      state.ui?.setCareerFocus?.({
        sectionId: 'discoveryThreeViews',
        title: 'Documentary explorer',
      });
      ctx.openWorldDiscoverySection?.('today');
      renderKey = '';
      render();
      return true;
    },
    stopCareer(options) {
      if (options && career !== options) return;
      career = null;
      armed = null;
      candidate = null;
      reticle.hidden = true;
      state.ui?.setCareerFocus?.(null);
      renderKey = '';
      render();
    },
    snapshot: () => ({
      careerId: career ? 'documentary' : null,
      variantId: career?.variantId || 'campaign',
      story: documentaryStory(job),
      rootPhase: job.phase,
      phase: career?.variantId === 'field-story' ? documentaryStory(job).phase : job.phase,
      mode: job.mode || null,
      subject: job.subject?.name || null,
      views: job.views?.map((v) => v.kind) || [],
      photos: album.photos.length,
      armed,
      busy,
      candidate: !!candidate,
      message,
      revision: job.revision,
    }),
    dispose() {
      career = null;
      storyValues = null;
      pendingStory = null;
      state.ui?.setCareerFocus?.(null);
      disposeThreeViewsHome(displayHost);
      disposed = true;
      hydration++;
      abort.abort();
      unregister?.();
      camera.dispose();
      reticle.remove();
      candidate = null;
      album = emptyPhotoAlbum();
      element?.replaceChildren();
    },
  };
}
