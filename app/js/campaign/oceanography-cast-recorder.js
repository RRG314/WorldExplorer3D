import { fieldCoordinate, fieldDistance, copyFieldRecord as copy } from './field-study-contract.js';
import {
  OCEANOGRAPHY_PROTOCOL as P,
  OCEANOGRAPHY_STUDIES,
  OCEANOGRAPHY_STATIONS,
  virtualWaterColumnReading
} from './oceanography-career.js';
// Volatile cast instrument. The existing voyage update supplies normal frames;
// this recorder owns neither a timer nor a renderer, transport or durable write.
export function createOceanographyCastRecorder({
  clock = () => performance.now(),
  wallClock = () => Date.now()
} = {}) {
  let run = null,
    lastTick = 0,
    lastDepth = null,
    disposed = false;
  const interrupt = (reason) => {
    run.interrupted = true;
    run.reason = reason;
  };
  function start(config, sample) {
    const station = OCEANOGRAPHY_STATIONS.find((s) => s.id === config?.stationId);
    if (
      disposed ||
      !station ||
      !OCEANOGRAPHY_STUDIES[config.variantId] ||
      !config.runId ||
      !config.voyageId ||
      !config.shipId ||
      !config.subId ||
      !fieldCoordinate(sample?.position) ||
      fieldDistance(station, sample.position) > 25 ||
      !Number.isFinite(sample.depthMeters)
    )
      throw Error('Bring the research vessel and recovered instrument to the planned station.');
    run = {
      config: copy(config),
      position: copy(sample.position),
      startedAt: wallClock(),
      completedAt: 0,
      activeSeconds: 0,
      excludedSeconds: 0,
      maximumDriftMeters: 0,
      samples: [],
      holdSeconds: 0,
      measurementComplete: false,
      ready: false,
      interrupted: false,
      depthMeters: sample.depthMeters,
      reason: 'Lowering the training instrument'
    };
    lastTick = clock();
    lastDepth = sample.depthMeters;
  }
  function tick(dt, sample = {}) {
    if (!run || disposed) return;
    const elapsed = Math.max(0, (clock() - lastTick) / 1000);
    lastTick = clock();
    if (run.interrupted) return;
    if (
      sample.voyageId !== run.config.voyageId ||
      sample.shipId !== run.config.shipId ||
      sample.subId !== run.config.subId ||
      sample.shared ||
      sample.liveGps ||
      sample.active !== true ||
      sample.moored !== true ||
      sample.atInstrument !== true
    ) {
      interrupt(
        'The cast left its supported vessel or instrument station. Recover and restart this cast.'
      );
      return;
    }
    if (!fieldCoordinate(sample.position) || !Number.isFinite(sample.depthMeters)) {
      interrupt('The instrument position is unavailable. Recover and restart this cast.');
      return;
    }
    const drift = fieldDistance(run.position, sample.position);
    run.maximumDriftMeters = Math.max(run.maximumDriftMeters, drift);
    if (drift > 2) {
      interrupt(
        'The vessel moved more than two metres during the cast. Recover the instrument and repeat at this station.'
      );
      return;
    }
    if (Math.abs(sample.depthMeters - lastDepth) > Math.max(0.3, elapsed * 2.5)) {
      interrupt(
        'The probe depth changed too far for a controlled downcast. Recover and restart the instrument.'
      );
      return;
    }
    lastDepth = sample.depthMeters;
    run.depthMeters = sample.depthMeters;
    if (sample.paused || sample.hidden) {
      run.excludedSeconds += elapsed;
      run.reason = 'Cast paused';
      return;
    }
    if (run.ready) return;
    const seconds = Math.min(Math.max(0, Number(dt) || 0), elapsed, 0.25);
    run.excludedSeconds += Math.max(0, elapsed - seconds);
    if (!run.measurementComplete) {
      run.activeSeconds += seconds;
      const target = P.depths[run.samples.length];
      if (target !== undefined) {
        if (Math.abs(sample.depthMeters - target) <= 0.04) run.holdSeconds += seconds;
        else run.holdSeconds = 0;
        run.reason = run.holdSeconds
          ? 'Holding the probe at its measured depth'
          : `Lowering toward ${target} m`;
        if (run.holdSeconds >= 0.35) {
          run.samples.push({
            depthMeters: Number(sample.depthMeters.toFixed(3)),
            ...virtualWaterColumnReading(
              run.config.variantId,
              run.config.stationId,
              Number(sample.depthMeters.toFixed(3))
            ),
            at: wallClock()
          });
          run.holdSeconds = 0;
        }
      }
      if (run.samples.length === 3 && run.activeSeconds + 1e-8 >= P.minimumActiveSeconds) {
        run.measurementComplete = true;
        run.reason = 'Recovering the instrument; readings retained';
      }
    } else {
      run.reason = 'Recovering the instrument; readings retained';
      if (sample.recovered === true) {
        run.ready = true;
        run.completedAt = wallClock();
        run.reason = 'Cast recovered and ready to save';
      }
    }
  }
  function snapshot() {
    if (!run) return null;
    return {
      ...copy(Object.fromEntries(Object.entries(run).filter(([key]) => key !== 'config'))),
      targetDepthMeters: run.measurementComplete ? null : P.depths[Math.min(2, run.samples.length)],
      stationId: run.config.stationId
    };
  }
  function result() {
    if (!run?.ready || run.interrupted || disposed)
      throw Error('Complete and recover this station’s instrument before filing its cast.');
    return {
      protocolId: P.id,
      stationId: run.config.stationId,
      runId: run.config.runId,
      voyageId: run.config.voyageId,
      truthType: 'authored-water-column-simulation',
      sourceId: `${P.sourceId}:${run.config.variantId}:${run.config.stationId}`,
      method: 'virtual-ctd-downcast',
      units: { depth: 'm', temperature: 'degC', practicalSalinity: 'unitless' },
      position: copy(run.position),
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      activeSeconds: Number(run.activeSeconds.toFixed(6)),
      excludedSeconds: Number(run.excludedSeconds.toFixed(6)),
      maximumDriftMeters: run.maximumDriftMeters,
      samples: copy(run.samples)
    };
  }
  return {
    start,
    tick,
    snapshot,
    result,
    reset() {
      run = null;
      lastDepth = null;
    },
    dispose() {
      disposed = true;
      run = null;
    }
  };
}
