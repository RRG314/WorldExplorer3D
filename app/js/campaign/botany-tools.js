import { createFieldPhotoTool, inspectFieldPhoto } from './field-photo-tool.js';
import { sampleFieldSurfacePoints } from './field-surface-samples.js';

export function createBotanyTools(runtime, qualified, presentation, options) {
  const camera = createFieldPhotoTool(runtime, qualified, presentation, {
    ...options,
    accepts: (a, slot) => ['photographs', 'plants'].includes(a.phase) && !a.captures[slot],
    captureKind: () => 'detail',
    inspect: (r, subject) =>
      inspectFieldPhoto(r, subject, {
        acceptIntersection: presentation.opacity.accepts,
        sampleSurfacePoints: (root) =>
          sampleFieldSurfacePoints({ THREE: globalThis.THREE, root, opacity: presentation.opacity })
      })
  });
  let disposed = false,
    pending = null;
  const plantId = (a) => ['a', 'b', 'c'][a.plantIndex];
  function read() {
    if (disposed || camera.busy || !options.isCurrent())
      throw Error('The plot instruments are not ready.');
    const a = options.getState().active;
    pending =
      a.phase === 'plants'
        ? presentation.readPlant(plantId(a), 5)
        : a.phase === 'planting'
          ? presentation.readCondition(5)
          : null;
    if (!pending) throw Error('This step does not request a sensor reading.');
    return pending;
  }
  return {
    get busy() {
      return camera.busy;
    },
    enter: camera.enter,
    photo: (slot) => camera.take(slot),
    read,
    snapshot: () => ({ busy: camera.busy, reading: pending, camera: camera.snapshot() }),
    prepare(command) {
      if (disposed || camera.busy || !options.isCurrent())
        throw Error('The plot instruments are not ready.');
      let action = { ...command };
      if (command.type === 'measure-plant') action.reading = read();
      else if (['mark-plot', 'revisit', 'followup'].includes(command.type))
        action.reading = presentation.readPlot(
          command.type === 'mark-plot'
            ? 'baseline'
            : command.type === 'revisit'
              ? 'visit'
              : 'followup'
        );
      else if (command.type === 'plant')
        action = { ...action, cell: Number(command.cell), condition: read() };
      return action;
    },
    dispose() {
      disposed = true;
      pending = null;
      camera.dispose();
    }
  };
}
