import { emitProductTelemetry } from './product-telemetry.js?v=1';

let sequence = 0;
// One bounded record per actual launch, after permission/selection gates.
export function createLaunchMeasurement(environment, { emit = emitProductTelemetry, now = () => performance.now() } = {}) {
  const startedAt = now();
  const index = ++sequence;
  let finished = false;
  const mode = ['earth', 'ocean', 'moon', 'mars', 'space'].includes(environment) ? environment : 'unknown';
  emit('we3d_launch_start', { environment: mode, launch_index: index });
  return Object.freeze({
    finish(outcome, reason = 'launch_failed') {
      if (finished) return false;
      finished = true;
      const terminal = outcome === 'ready' ? 'ready' : outcome === 'abandoned' ? 'abandoned' : 'failed';
      const safeReason = ['launch_failed', 'world_not_ready', 'page_hidden', 'page_closed'].includes(reason) ? reason : 'launch_failed';
      emit(`we3d_launch_${terminal}`, { environment: mode, launch_index: index,
        load_duration_ms: Math.min(1800000, Math.max(0, Math.round(now() - startedAt))),
        ...(terminal === 'ready' ? {} : { failure_reason: safeReason }) });
      return true;
    }
  });
}
