(function () {
  function setTitleMode(mode) {
    var suggestedBtn = document.getElementById('suggestedToggle');
    var customBtn = document.getElementById('customToggle');
    var moonBtn = document.getElementById('moonToggle');
    var spaceBtn = document.getElementById('spaceToggle');
    var suggestedPanel = document.getElementById('suggestedPanel');
    var customPanel = document.getElementById('customPanel');
    var moonPanel = document.getElementById('moonPanel');
    var spacePanel = document.getElementById('spacePanel');

    if (!suggestedBtn || !customBtn || !suggestedPanel || !customPanel) return;

    var nextMode = mode === 'custom' || mode === 'moon' || mode === 'space' ? mode : 'suggested';

    suggestedBtn.classList.toggle('active', nextMode === 'suggested');
    customBtn.classList.toggle('active', nextMode === 'custom');
    if (moonBtn) moonBtn.classList.toggle('active', nextMode === 'moon');
    if (spaceBtn) spaceBtn.classList.toggle('active', nextMode === 'space');

    suggestedPanel.classList.toggle('show', nextMode === 'suggested');
    customPanel.classList.toggle('show', nextMode === 'custom');
    if (moonPanel) moonPanel.classList.toggle('show', nextMode === 'moon');
    if (spacePanel) spacePanel.classList.toggle('show', nextMode === 'space');

    if (nextMode === 'custom') {
      globalThis.selLoc = 'custom';
      globalThis.loadingScreenMode = 'earth';
      return;
    }

    if (nextMode === 'suggested') {
      var selected = document.querySelector('#suggestedPanel .loc.sel');
      if (!selected) selected = document.querySelector('#suggestedPanel .loc[data-loc="baltimore"]');
      if (selected) {
        globalThis.selLoc = selected.getAttribute('data-loc') || globalThis.selLoc || 'baltimore';
      }
      globalThis.loadingScreenMode = 'earth';
      return;
    }

    globalThis.loadingScreenMode = nextMode;
  }

  function selectSuggestedCard(targetEl) {
    if (!targetEl) return;
    var selectedLoc = targetEl.closest ? targetEl.closest('.loc[data-loc]') : null;
    if (!selectedLoc) return;

    var cards = document.querySelectorAll('#suggestedPanel .loc');
    for (var i = 0; i < cards.length; i++) cards[i].classList.remove('sel');
    selectedLoc.classList.add('sel');
    globalThis.selLoc = selectedLoc.getAttribute('data-loc') || globalThis.selLoc || 'baltimore';
    setTitleMode('suggested');
  }

  function bindTitleMenuFix() {
    var root = document.getElementById('titleScreen');
    if (!root) return;
    if (root.dataset.titleMenuFixBound === '1') return;
    root.dataset.titleMenuFixBound = '1';

    var suggestedBtn = document.getElementById('suggestedToggle');
    var customBtn = document.getElementById('customToggle');
    var moonBtn = document.getElementById('moonToggle');
    var spaceBtn = document.getElementById('spaceToggle');
    var suggestedPanel = document.getElementById('suggestedPanel');

    if (suggestedBtn) {
      suggestedBtn.addEventListener('click', function (event) {
        if (event && event.cancelable) event.preventDefault();
        setTitleMode('suggested');
      });
    }

    if (customBtn) {
      customBtn.addEventListener('click', function (event) {
        if (event && event.cancelable) event.preventDefault();
        setTitleMode('custom');
      });
    }

    if (moonBtn) {
      moonBtn.addEventListener('click', function (event) {
        if (event && event.cancelable) event.preventDefault();
        setTitleMode('moon');
      });
    }

    if (spaceBtn) {
      spaceBtn.addEventListener('click', function (event) {
        if (event && event.cancelable) event.preventDefault();
        setTitleMode('space');
      });
    }

    if (suggestedPanel) {
      suggestedPanel.addEventListener('click', function (event) {
        var target = event.target;
        if (!(target instanceof Element)) return;
        selectSuggestedCard(target);
      });
    }

    globalThis.setTitleLocationMode = setTitleMode;
    globalThis.selectSuggestedLocationCard = selectSuggestedCard;
    globalThis.handleTitleModeClick = setTitleMode;
    globalThis.handleSuggestedCardClick = selectSuggestedCard;

    setTitleMode(globalThis.selLoc === 'custom' ? 'custom' : 'suggested');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindTitleMenuFix, { once: true });
  } else {
    bindTitleMenuFix();
  }
})();
