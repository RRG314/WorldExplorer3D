let modulePromise = null;
let removeTitleActivator = null;

function installOnDemandFlowerChallenge(appCtx) {
  function installTitleActivator() {
    if (removeTitleActivator) return false;
    const button = document.getElementById('flowerChallengeToggleBtn');
    if (!button) return false;

    const activate = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (modulePromise) return;
      void ensureFlowerChallengeReady()
        .then(() => button.click())
        .catch((error) => console.warn('[flower-challenge] On-demand initialization failed.', error));
    };
    button.addEventListener('click', activate);
    button.addEventListener('touchend', activate, { passive: false });
    removeTitleActivator = () => {
      button.removeEventListener('click', activate);
      button.removeEventListener('touchend', activate);
      removeTitleActivator = null;
    };
    return true;
  }

  async function ensureFlowerChallengeReady() {
    if (!modulePromise) {
      modulePromise = import('../flower-challenge.js?v=56').then((challenge) => {
        removeTitleActivator?.();
        challenge.setupFlowerChallenge?.();
        return challenge;
      }).catch((error) => {
        modulePromise = null;
        throw error;
      });
    }
    return modulePromise;
  }

  Object.assign(appCtx, {
    ensureFlowerChallengeReady,
    closeFlowerChallengeTitlePanel: () => false,
    consumePendingFlowerChallengeStart: () => false,
    getFlowerChallengeBackendStatus: () => ({
      configPresent: false,
      firebaseReady: false,
      backend: 'not-loaded',
      challengeActive: false
    }),
    refreshFlowerLeaderboard: (...args) => modulePromise
      ? modulePromise.then((challenge) => challenge.refreshFlowerLeaderboard?.(...args) ?? false)
      : Promise.resolve(false),
    requestFlowerChallengeFromTitle: async (...args) => {
      const challenge = await ensureFlowerChallengeReady();
      return challenge.requestFlowerChallengeFromTitle?.(...args) ?? false;
    },
    setChallengeLeaderboardView: async (...args) => {
      const challenge = await ensureFlowerChallengeReady();
      return challenge.setChallengeLeaderboardView?.(...args) ?? false;
    },
    setupFlowerChallenge: installTitleActivator,
    startFlowerChallenge: async (...args) => {
      const challenge = await ensureFlowerChallengeReady();
      return challenge.startFlowerChallenge?.(...args) ?? false;
    },
    stopFlowerChallenge: (...args) => modulePromise
      ? void modulePromise.then((challenge) => challenge.stopFlowerChallenge?.(...args))
      : false,
    submitFishingScore: async (...args) => {
      const challenge = await ensureFlowerChallengeReady();
      return challenge.submitFishingScore?.(...args) ?? false;
    },
    submitDeFlockScore: async (...args) => {
      const challenge = await ensureFlowerChallengeReady();
      return challenge.submitDeFlockScore?.(...args) ?? null;
    },
    submitPaintTownScore: async (...args) => {
      const challenge = await ensureFlowerChallengeReady();
      return challenge.submitPaintTownScore?.(...args) ?? false;
    },
    toggleFlowerActionMenu: async (...args) => {
      const challenge = await ensureFlowerChallengeReady();
      return challenge.toggleFlowerActionMenu?.(...args) ?? false;
    },
    updateFlowerChallenge: () => false
  });

  installTitleActivator();
  return { ensureFlowerChallengeReady };
}

export { installOnDemandFlowerChallenge };
