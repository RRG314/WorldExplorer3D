// Pure measurement state. Positions are used locally to recognize movement and
// are never included in an event. Hiding/pausing suspends time, not the session.
export function createGameplayAnalyticsSession({ emit, now = () => performance.now() }) {
  let session = null;
  let count = 0;
  let previous = null;
  let sampledAt = now();
  let inputAt = -Infinity;
  const params = () => ({ session_index: count, environment: session.environment,
    travel_mode: session.mode, duration_sec: Math.round(session.activeMs / 1000) });
  function action(kind = 'interaction') {
    if (!session || !previous?.active) return false;
    inputAt = now();
    if (session.firstAction) return false;
    session.firstAction = true;
    emit('we3d_first_action', { ...params(), action_kind: kind });
    return true;
  }
  function touch() { if (session && previous?.active) inputAt = now(); }
  function end(reason = 'returned_to_title') {
    if (!session) return;
    emit('we3d_world_session_end', { ...params(), end_reason: reason });
    session = null; previous = null; inputAt = -Infinity;
  }
  function sample(value) {
    const time = now();
    const elapsed = Math.max(0, time - sampledAt);
    sampledAt = time;
    if (!value.started) { end(); return snapshot(); }
    if (!session && value.ready && value.visible) {
      count++;
      session = { activeMs: 0, firstAction: false, fiveMinutes: false,
        mode: value.mode, environment: value.environment };
      emit('we3d_world_session_start', { ...params(), start_reason: 'world_ready' });
    }
    if (!session) { previous = null; return snapshot(); }
    const active = !!(value.ready && value.visible && !value.paused);
    if (value.input && active) inputAt = time;
    // Long gaps represent throttling, suspension or a stalled page. Never
    // backfill them as gameplay. One interval around an idle boundary is dropped.
    if (active && previous?.active && elapsed <= 5000 && time - inputAt <= 60000) {
      session.activeMs += elapsed;
    }
    if (active && previous?.active && value.mode === previous.mode &&
        value.environment === previous.environment && (value.input || previous.input)) {
      const a = value.position, b = previous.position;
      if (a && b) {
        const distance = Math.hypot(a.x - b.x, (a.y || 0) - (b.y || 0), a.z - b.z);
        if (Number.isFinite(distance) && distance >= 1 && distance <= 1000) action('movement');
      }
    }
    session.mode = value.mode; session.environment = value.environment;
    previous = { ...value, active };
    if (session.firstAction && session.activeMs >= 300000 && !session.fiveMinutes) {
      session.fiveMinutes = true;
      emit('we3d_active_play_5m', params());
    }
    return snapshot();
  }
  function snapshot() {
    return { active: !!session, count, activeSeconds: Math.round((session?.activeMs || 0) / 1000),
      firstAction: !!session?.firstAction, fiveMinutes: !!session?.fiveMinutes };
  }
  return { sample, action, touch, end, snapshot };
}

export function analyticsTravelMode(ctx) {
  if (ctx.oceanMode?.diver?.active) return 'scuba';
  if (ctx.spaceFlight?.active) return 'space_flight';
  if (ctx.oceanMode?.active) return 'submarine';
  if (ctx.boatMode?.active) return 'boat';
  if (ctx.planeMode?.active) return 'aircraft';
  if (ctx.droneMode) return 'drone';
  if (ctx.Walk?.state?.mode === 'walk') {
    const swim = ctx.Walk.state.walker?.swimming;
    return swim ? (swim.equipment === 'scuba' ? 'scuba' : 'swimming') : 'walking';
  }
  return 'driving';
}
