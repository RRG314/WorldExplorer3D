const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const money = (value) => `${Math.round(Number(value) || 0).toLocaleString()} credits`;

// This view delegates every command to its original owner. It has no player
// progression, wallet, storage, animation or spawn authority of its own.
export function createPlayerJourney({
  runtime,
  read,
  openCareer,
  openGarage,
  personalize,
  freeRoam,
  homeReturn,
  visitHome,
  buyHome,
  setPrimary,
  openWorkspace,
  onJournal,
  onLeaderboard,
  onBackup,
  onSync,
  chooseHomeTown,
  onLayer,
  onFocus,
}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'playerJourney';
  dialog.className = 'player-journey';
  dialog.setAttribute('aria-labelledby', 'playerJourneyTitle');
  document.body.append(dialog);
  let data = null,
    busy = false,
    revision = 0,
    origin = null,
    message = '';
  function render() {
    const p = data?.profile || {},
      portfolio = data?.portfolio,
      view = data?.housing,
      home = view?.primaryHome,
      owned = !!home,
      started = !!p.journeyPreferences?.introCompletedAt;
    dialog.setAttribute('aria-busy', String(busy));
    dialog.innerHTML = `<header><div><span class="experience-eyebrow">YOUR EXPLORER</span><h2 id="playerJourneyTitle">${escape(portfolio?.name || 'Your journey')}</h2></div><button data-journey="close" aria-label="Close Your journey"${busy ? ' disabled' : ''}>×</button></header><p class="journey-status" role="status" aria-live="polite">${escape(message)}</p><div class="journey-body">
  <section class="journey-start"><div><span class="experience-eyebrow">MAKE YOURSELF AT HOME</span><h3>A beginning you can build on.</h3><p>Choose a direction, make a place of your own and head out when you are ready. You can change careers or explore freely while keeping every saved result.</p></div><ol>
   <li${started ? ' class="complete"' : ''}><strong>Your Explorer</strong><span>${started ? 'Appearance and starting choices saved.' : 'Choose your appearance, direction and first car.'}</span><button data-journey="personalize">${started ? 'Edit starting choices' : 'Set up your Explorer'}</button></li>
   <li><strong>Your car & equipment</strong><span>${escape(data?.carLabel || 'Your owned starter car is in the Garage.')} · Owned cars, condition and upgrades stay with you.</span><button data-journey="garage"${runtime.gameStarted ? '' : ' disabled'}>Open Garage</button>${runtime.gameStarted ? '' : '<small>Enter an Earth location to use the Garage. Starting-car choices are in your introduction.</small>'}</li>
   <li${owned ? ' class="complete"' : ''}><strong>Your home base</strong><span>${owned ? `${escape(home.label)} · ${escape(home.locationLabel)}` : 'Visit a mapped home, review its price, then buy it with your personal credits.'}</span><button data-journey="${owned ? 'return-home' : 'homes'}">${owned ? 'Return home' : 'Find a starter home'}</button></li>
   <li${p.openingChapter?.phase === 'complete' ? ' class="complete"' : ''}><strong>Your first discovery</strong><span>Learn the field controls, save a real discovery and earn the First Bearings badge.</span><button data-journey-career="career:explorer">${p.openingChapter?.phase === 'complete' ? 'Continue Explorer journey' : 'Begin First Bearings'}</button></li></ol></section>
  <section class="journey-direction"><h3>Your next direction</h3><p>${portfolio?.following ? `Following ${escape(portfolio.careers.find((c) => c.id === portfolio.following)?.label || 'your career')}.` : 'Free exploration. Every career remains available.'} Choosing a different direction keeps your assignments, skills, cars and belongings.</p><div class="entry-actions"><button data-journey="careers">Choose or resume a career</button><button data-journey="free">Explore freely</button><button data-journey="personalize">Start the introduction again</button></div></section>
  <section id="journeyHomes"><h3>A safe place to return to</h3><p>Personal homes and their storage save with your journey. Sign in and choose your account save to keep them across devices. A home is a return destination; returning does not repair vehicles or restore health. Shared property deeds stay in Properties.</p>${view ? `<p><strong>Personal balance · ${money(view.credits)}</strong></p>` : ''}
   ${view?.homes?.map((h) => `<article class="journey-home"><div><strong>${escape(h.label)}</strong><span>${escape(h.locationLabel)} · ${h.personalStarter ? 'Included workspace' : 'Purchased personal home'}</span></div><button data-journey-return="${escape(h.id)}">Return here</button><button data-journey-primary="${escape(h.id)}"${view.primaryHomeId === h.id ? ' disabled' : ''}>${view.primaryHomeId === h.id ? 'Return destination' : 'Use as home base'}</button></article>`).join('') || '<p>No home chosen yet. You can explore and earn achievements before buying.</p>'}
   ${data?.offers?.length ? `<details data-journey-offers><summary>Nearby starter homes</summary><p>These are personal game homes. Buying does not reserve a real address or a shared deed. Visit the entrance before buying; prices use your existing personal wallet.</p>${data.offers.map((h) => `<article class="journey-home"><div><strong>${escape(h.label)}</strong><span>${Math.round(h.area)} m² · ${money(h.price)} · ${Math.round(h.distance * (runtime.METERS_PER_WORLD_UNIT || 1.11))} m away</span></div><button data-journey-visit="${escape(h.id)}">Visit entrance</button><button data-journey-buy="${escape(h.id)}"${h.price > view.credits || h.distance > 55 ? ' disabled' : ''}>Buy this home</button></article>`).join('')}</details>` : `<p>${runtime.gameStarted ? 'No supported residential entrance is available nearby. Choose a town on the globe, or keep exploring.' : 'Enter an Earth town to find mapped homes with supported entrances.'}</p>`}
   <button data-journey="workspace"${!owned ? ' disabled' : ''}>Enter or arrange your home</button><button data-journey="refresh">Refresh homes & progress</button></section>
  <section><h3>Your career portfolio</h3><p>Each pursuit keeps its own assignment, practical stages and saved reports. Complete the first assignment to open its follow-on work where available.</p><div class="journey-careers">${portfolio?.careers.map((c) => `<article><span class="experience-eyebrow">${escape(c.label)}${c.following ? ' · FOLLOWING' : ''}</span><h4>${escape(c.title || c.label)}</h4><p>${escape(c.summary || c.next)}</p>${c.total ? `<progress max="${c.total}" value="${c.done}" aria-label="${escape(c.label)} assignment progress"></progress><small>${c.done}/${c.total} practical stages${c.completedStudies ? ` · ${c.completedStudies} saved studies` : ''}</small>` : ''}<p><strong>Next</strong> · ${escape(c.next)}</p>${c.choices.length > 1 ? `<details><summary>Available assignments · ${c.choices.length}</summary><ul>${c.choices.map((choice) => `<li>${escape(choice.label)}</li>`).join('')}</ul></details>` : ''}<button data-journey-career="${escape(c.id)}">${c.resume ? 'Resume assignment' : c.assignmentComplete ? 'Review & continue' : 'Open career'}</button></article>`).join('') || '<p>Reading your saved careers…</p>'}</div></section>
  <section><h3>Achievements you earned</h3><p>Awards come from completed fieldwork and saved outcomes. Changing menus or careers earns no XP.</p><div class="journey-awards">${portfolio?.achievements.map((a) => `<article><strong>◆ ${escape(a.label)}</strong><small>${escape(a.detail || 'Saved career achievement')}</small></article>`).join('') || '<p>Your first saved result starts your achievement collection.</p>'}</div><div class="entry-actions"><button data-journey="journal">Open Journal & skills</button><button data-journey="leaderboard">Career milestones & leaderboards</button></div></section>
  <section class="journey-save"><h3>Keep your journey</h3><p data-journey-sync-status>${escape(runtime.getJourneySyncStatus?.()?.message || 'Your device save is kept.')}</p><p>Sign in to keep your career, discoveries, photographs, personal home and setup together across devices. Existing device history is added to an account only when you choose it. Account cars, shared property and online results retain their ownership.</p><div class="entry-actions"><button data-journey="sync">Account save & devices</button><button data-journey="backup">Journal backup & recovery</button></div></section></div>`;
    if (busy) for (const button of dialog.querySelectorAll('button')) button.disabled = true;
  }
  async function refresh() {
    data = await read();
    if (dialog.open) render();
  }
  function close({ focus = true } = {}) {
    revision++;
    if (dialog.open) dialog.close();
    onLayer(false);
    if (focus && origin?.isConnected) origin.focus({ preventScroll: true });
  }
  async function open() {
    if (busy) return;
    origin = document.activeElement;
    message = 'Reading your saved journey…';
    busy = true;
    onLayer(true);
    if (!dialog.open) dialog.showModal();
    render();
    const run = ++revision;
    try {
      const result = await read();
      if (run !== revision) return;
      data = result;
      message = '';
    } catch (error) {
      if (run === revision)
        message =
          error.message || 'Your saved journey could not load. Your progress is kept. Try again.';
    } finally {
      busy = false;
      if (run === revision && dialog.open) render();
    }
  }
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!busy) close();
  });
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  dialog.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button || busy) return;
    const action = button.dataset.journey;
    if (action === 'close') {
      close();
      onFocus();
      return;
    }
    if (action === 'homes') {
      if (!runtime.gameStarted || runtime.getEnv?.() !== 'EARTH') {
        close({ focus: false });
        chooseHomeTown();
        return;
      }
      const details = dialog.querySelector('[data-journey-offers]');
      if (details) details.open = true;
      dialog.querySelector('#journeyHomes').scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    const careers = { ...button.dataset };
    if (careers.journeyCareer) {
      close({ focus: false });
      await openCareer(careers.journeyCareer);
      return;
    }
    const leave = {
      careers: () => openCareer(),
      garage: openGarage,
      personalize,
      workspace: openWorkspace,
      journal: onJournal,
      leaderboard: onLeaderboard,
      backup: onBackup,
      sync: onSync,
    };
    if (leave[action]) {
      close({ focus: false });
      await leave[action]();
      return;
    }
    busy = true;
    message = '';
    render();
    try {
      if (action === 'free') {
        await freeRoam();
        close({ focus: false });
        onFocus();
        return;
      }
      if (action === 'return-home' || careers.journeyReturn) {
        const home = data.housing.homes.find(
          (h) => h.id === (careers.journeyReturn || data.housing.primaryHomeId)
        );
        if (!home) throw Error('Choose a saved home first.');
        close({ focus: false });
        await homeReturn(home);
        onFocus();
        return;
      }
      if (careers.journeyVisit) {
        const offer = data.offers.find((h) => h.id === careers.journeyVisit);
        if (!offer) throw Error('Refresh nearby homes first.');
        await visitHome(offer);
        message = 'Entrance reached. Review the price, then choose Buy this home.';
      }
      if (careers.journeyBuy) {
        const offer = data.offers.find((h) => h.id === careers.journeyBuy);
        if (!offer) throw Error('Refresh nearby homes first.');
        const result = await buyHome(offer.id);
        if (!result.ok)
          throw Error(
            ['insufficient_credits', 'not_enough_credits'].includes(result.reason)
              ? 'You need more personal credits for this home.'
              : {
                  save_in_another_tab:
                    'Your personal belongings are open in another tab. Close it and try again.',
                  save_failed: 'Your home purchase could not save. No purchase was completed.',
                  wallet_unavailable:
                    'Your personal wallet is still preparing. Try again in a moment.',
                }[result.reason] ||
                  'This home purchase could not finish. Refresh homes and try again.'
          );
        message = 'Home purchased and saved. You can always return here from Your journey.';
      }
      if (careers.journeyPrimary) {
        const result = await setPrimary(careers.journeyPrimary);
        if (!result.ok)
          throw Error('Your home base could not save. Your previous destination is kept.');
        message = 'Home base saved.';
      }
      await refresh();
    } catch (error) {
      message = error.message || 'That action could not finish. Your saved progress is kept.';
      if (!dialog.open) {
        onLayer(true);
        dialog.showModal();
      }
    } finally {
      busy = false;
      if (dialog.open) {
        const scroll = dialog.querySelector('.journey-body')?.scrollTop || 0;
        render();
        dialog.querySelector('.journey-body').scrollTop = scroll;
        if (careers.journeyVisit || careers.journeyBuy) {
          const details = dialog.querySelector('[data-journey-offers]');
          if (details) details.open = true;
          dialog.querySelector('#journeyHomes').scrollIntoView({ block: 'start' });
        }
      }
    }
  });
  return Object.freeze({
    open,
    close,
    refresh,
    snapshot: () => ({ open: dialog.open, busy }),
    dispose() {
      close();
      dialog.remove();
    },
  });
}
