// Launch preparation belongs to the flight session, not its mutable course.
// A retarget or temporary visit inside the ship must not strand its pause.
export function createSpaceLaunchReadiness(appContext, scope, sessionId) {
  const reason = `space_launch:${sessionId}`;
  appContext.setPauseReason?.(reason, true);
  const release = scope.defer(() => appContext.setPauseReason?.(reason, false), 'pause');
  const isCurrent = () => scope.isActive() && appContext.spaceFlight?._sessionId === sessionId;

  return Object.freeze({
    schedule({ delayMs = 1000, onReady } = {}) {
      if (!isCurrent()) return false;
      const destination = appContext.spaceFlight.destination;
      const journeyId = appContext.spaceJourney?.journeyId || null;
      const journeyPhase = appContext.spaceJourney?.phase || null;
      scope.timeout(() => {
        release();
        if (!isCurrent()) return;
        const flight = appContext.spaceFlight;
        if (flight.mode === 'launching') flight.mode = 'flying';
        // The session is ready even if a newer course has already advanced.
        // Only the unchanged launch may publish its initial route state/UI.
        if (!flight.active || flight.destination !== destination ||
            (appContext.spaceJourney?.journeyId || null) !== journeyId ||
            (appContext.spaceJourney?.phase || null) !== journeyPhase) return;
        onReady?.();
      }, delayMs);
      return true;
    }
  });
}
