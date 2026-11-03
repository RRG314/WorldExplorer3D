import { createFieldCourseScene } from './field-course-scene.js';
import { createAmbientWildlifeRuntime } from '../discovery/wildlife-runtime.js?v=6';
import { wildlifeTarget, WILDLIFE_HABITATS } from './wildlife-career.js';

const compatible = new Set(['park', 'forest', 'field', 'rural']);
export function wildlifeHabitatCell(runtime, point) {
  const publication = runtime.worldDiscoveryPublicationStore?.get()?.environment;
  if (publication?.type !== 'EnvironmentContextPublication') return null;
  return (
    publication.cells.find(
      (cell) =>
        point.x >= cell.bounds.minX &&
        point.x <= cell.bounds.maxX &&
        point.z >= cell.bounds.minZ &&
        point.z <= cell.bounds.maxZ &&
        cell.contexts.some((tag) => compatible.has(tag))
    ) || null
  );
}
export function wildlifeSiteEligibility(runtime, { points, metersPerUnit: u, ground }) {
  for (const id of ['a', 'b']) {
    const p = points[id];
    // All new model and route footprints are admitted before the profile accepts
    // a site. The course never changes real terrain, vegetation or corridors.
    for (const [x, z, r] of [
      [0, -7, 1.5],
      [-2.5, -9.5, 0.65],
      [2.5, -9, 1.2],
      [0, 3.1, 0.7],
      [0, -3.1, 0.7],
      [1.5, -0.4, 0.6],
      [2, 0.55, 0.15],
      [-1.45, -0.5, 0.2]
    ]) {
      const at = { x: p.x + x / u, z: p.z + z / u };
      if (!wildlifeHabitatCell(runtime, at))
        return 'Choose a mapped park, woodland or field for this habitat exercise.';
      const supported = ground(at.x, at.z, r);
      if (!supported) return 'A habitat footprint is obstructed or wet.';
      const distance = Math.hypot(x, z),
        steps = Math.max(1, Math.ceil(distance / 2));
      let previous = p;
      for (let step = 1; step <= steps; step++) {
        const t = step / steps,
          current = ground(p.x + (x / u) * t, p.z + (z / u) * t, 0.5);
        if (!current) return 'A habitat approach is obstructed or wet.';
        if ((Math.abs(current.y - previous.y) * u) / (distance / steps || 1) > 0.25)
          return 'Choose gentler ground for the observation plots.';
        previous = current;
      }
    }
  }
  return true;
}

export async function createWildlifePresentation(runtime, qualified, study, options) {
  const scene = createFieldCourseScene(runtime, qualified, 'wildlife', options),
    { T, u, root, material, box, mesh, at, label, collider } = scene;
  let actors = null;
  try {
    const runId = options.getState().active.runId,
      timber = material(0x65523d),
      gold = material(0xf6d27e),
      green = material(0x356a52),
      soil = material(0x745b40),
      dark = material(0x242925);
    const signs = {},
      signObservations = {},
      photoMarkings = {},
      sensors = {},
      routes = {};
    const point = (id, x, z) => {
      const p = qualified.points[id],
        wx = p.x + x / u,
        wz = p.z + z / u;
      return {
        x: wx,
        z: wz,
        y: runtime.SurfaceQuery.driveAt(wx, wz, { preferRoad: false }).position.y
      };
    };
    const plans = [];
    for (const id of ['a', 'b']) {
      const group = at(id);
      const postPoint = point(id, 2, 0.55),
        postRise = (postPoint.y - qualified.points[id].y) * u;
      label(
        group,
        `${id.toUpperCase()} · ${WILDLIFE_HABITATS[id].label}\nVirtual observation plot`,
        2,
        1.7 + postRise,
        0.55,
        1.4,
        0.4
      );
      box(group, 0.08, 1.65, 0.08, timber, 2, 0.825 + postRise, 0.55);
      collider(`${id}-plot-sign`, 0.06, 0.06, 1.85, postPoint);
      // Stakes frame a walkable 6.2 m transect. Ground remains the existing surface.
      routes[id] = { start: point(id, 0, 3.1), finish: point(id, 0, -3.1) };
      for (const [key, p] of Object.entries(routes[id])) {
        const g = new T.Group();
        g.position.set(p.x, p.y, p.z);
        root.add(g);
        for (const x of [-0.65, 0.65]) {
          box(g, 0.04, 0.45, 0.04, gold, x, 0.225);
          collider(`${id}-${key}-${x}`, 0.035, 0.035, 0.45, { x: p.x + x / u, y: p.y, z: p.z });
        }
        label(g, key === 'start' ? 'START' : 'FINISH', 0, 0.28, 0, 1, 0.28);
      }
      const sign = new T.Group(),
        sp = point(id, 1.5, -0.4);
      sign.position.set(sp.x, sp.y, sp.z);
      root.add(sign);
      sign.name = `Diagnostic ${id === 'a' ? 'split hoof' : 'canid paw'} training signs`;
      box(sign, 0.85, 0.08, 0.75, timber, 0, 0.68);
      box(sign, 0.78, 0.035, 0.68, soil, 0, 0.735);
      for (const x of [-0.3, 0.3])
        for (const z of [-0.25, 0.25]) box(sign, 0.045, 0.66, 0.045, timber, x, 0.33, z);
      const markings = new T.Group();
      markings.name = id === 'a' ? 'Hoof impressions' : 'Canid paw impressions';
      sign.add(markings);
      photoMarkings[id] = markings;
      const diagnosticMeshes = [];
      for (let step = 0; step < 2; step++) {
        const x = (step - 0.5) * 0.32,
          z = (step - 0.5) * 0.29;
        if (id === 'a')
          for (const side of [-1, 1]) {
            const hoof = mesh(
              markings,
              new T.SphereGeometry(0.055 / u, 10, 6),
              dark,
              x + side * 0.04,
              0.76,
              z
            );
            diagnosticMeshes.push(hoof);
            hoof.scale.set(0.6, 0.12, 1.5);
          }
        else {
          const pad = mesh(markings, new T.SphereGeometry(0.063 / u, 12, 7), dark, x, 0.76, z);
          diagnosticMeshes.push(pad);
          pad.scale.set(1, 0.12, 0.85);
          for (let toe = 0; toe < 4; toe++) {
            const t = mesh(
              markings,
              new T.SphereGeometry(0.023 / u, 8, 5),
              dark,
              x + (toe - 1.5) * 0.038,
              0.76,
              z - 0.075 - Math.sin((toe * Math.PI) / 3) * 0.024
            );
            diagnosticMeshes.push(t);
            t.scale.y = 0.2;
          }
        }
      }
      label(sign, 'Original training signs · not dated', 0, 1.02, -0.15, 1.3, 0.25);
      collider(`${id}-sign`, 0.43, 0.38, 0.8, sp);
      signs[id] = sign;
      signObservations[id] = diagnosticMeshes;
      const mount = new T.Group(),
        mp = point(id, -1.45, -0.5);
      mount.position.set(mp.x, mp.y, mp.z);
      root.add(mount);
      box(mount, 0.08, 1.25, 0.08, timber, 0, 0.625);
      const sensor = new T.Group();
      sensor.position.y = 1.15 / u;
      mount.add(sensor);
      box(sensor, 0.22, 0.28, 0.14, dark);
      const lens = mesh(
        sensor,
        new T.CylinderGeometry(0.043 / u, 0.043 / u, 0.05 / u, 12),
        green,
        0,
        0.02,
        -0.09
      );
      lens.rotation.x = Math.PI / 2;
      label(mount, 'TRAIL SENSOR', 0, 1.58, 0, 1.1, 0.25);
      collider(`${id}-sensor`, 0.12, 0.12, 1.35, mp);
      sensors[id] = {
        mount,
        sensor,
        aligned: false,
        bearing: null,
        origin: { x: mp.x, y: mp.y + 1.15 / u, z: mp.z }
      };
      if (id === 'a') {
        const treePoint = point(id, -2.5, -9.5);
        await scene.asset('nature-broadleaf', treePoint, 5.2);
        collider('wooded-tree', 0.2, 0.2, 5.2, treePoint);
        await scene.asset('nature-shrub', point(id, 2.5, -9), 1.35);
        await scene.asset('nature-fern', point(id, -2, -5), 0.7);
      } else {
        for (const [x, z] of [
          [-2, -8],
          [2, -9],
          [-2, -5]
        ])
          await scene.asset('nature-grass', point(id, x, z), 0.35);
      }
      const home = point(id, 0, -7),
        cell = wildlifeHabitatCell(runtime, home);
      if (!cell) throw Error('The habitat publication changed. Reopen the course.');
      plans.push({
        id: `research-wildlife:${runId}:${id}:animal`,
        cellId: cell.cellId,
        speciesId: id === 'a' ? 'white-tailed-deer' : 'woodland-fox',
        archetype: 'small-mammal',
        label: id === 'a' ? 'White-tailed deer training model' : 'Woodland fox training model',
        home,
        phase: id === 'a' ? 0 : Math.PI,
        companionPolicy: 'observe-only',
        evidenceClass: 'virtual-training-observation',
        displayHeightMeters: id === 'a' ? 1.75 : 1,
        metersPerUnit: u,
        wanderRadiusMeters: 0.7,
        followSurface: true
      });
    }
    await scene.table('bench');
    label(
      at('bench'),
      'HABITAT COMPARISON\nPaired checklists · effort · uncertainty',
      0,
      1.7,
      0,
      3.1,
      0.8
    );
    const proxy = Object.create(runtime);
    proxy.addEarthWorldObject = (object) => root.add(object);
    actors = createAmbientWildlifeRuntime(
      proxy,
      {
        type: 'AmbientWildlifePlan',
        actors: plans,
        diagnostics: { maxActors: 2 }
      },
      options
    );
    const ready = await actors.ready;
    if (ready.some((ok) => !ok) || options.signal?.aborted || options.isCurrent?.() === false)
      throw Error(
        'The wildlife models could not load. Your existing records are kept; reopen to retry.'
      );
    const arrow = new T.Group();
    root.add(arrow);
    const cone = mesh(arrow, new T.ConeGeometry(0.17 / u, 0.35 / u, 8), gold);
    cone.rotation.z = Math.PI;
    const photoSubjects = Object.fromEntries(
      ['a', 'b'].map((id) => [
        `habitat-${id}`,
        { id: `${qualified.site.id}:sign:${id}`, objects: [photoMarkings[id]] }
      ])
    );
    scene.attach();
    function tick(dt) {
      if (runtime.paused || document.hidden) return;
      actors.update(runtime.Walk?.state?.walker, dt, runtime.getEnv?.());
    }
    return {
      photoSubjects,
      signObservations,
      signs,
      sensors,
      routes,
      subjects: () => actors.observationSubjects(),
      alignSensor(id, bearing) {
        const row = sensors[id];
        if (!row || !Number.isFinite(bearing))
          throw Error('Aim along the marked animal path first.');
        row.bearing = bearing;
        row.sensor.rotation.y = bearing + Math.PI;
        row.sensor.updateWorldMatrix(true, true);
        // Observe from the physical lens face, outside the camera housing.
        const origin = row.sensor.localToWorld(new T.Vector3(0, 0.02 / u, -0.13 / u));
        row.origin = { x: origin.x, y: origin.y, z: origin.z };
        row.aligned = true;
      },
      update(active) {
        const p = qualified.points[wildlifeTarget(active)];
        arrow.position.set(p.x, p.y + 2.35 / u, p.z);
        arrow.visible = active.phase !== 'complete';
      },
      tick,
      root,
      get budget() {
        return { ...scene.budget(), actors: actors.snapshot(), habitats: 2 };
      },
      dispose() {
        actors?.dispose();
        scene.dispose();
      }
    };
  } catch (error) {
    actors?.dispose();
    scene.dispose();
    throw error;
  }
}
