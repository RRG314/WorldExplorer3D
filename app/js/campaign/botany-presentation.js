import { createFieldCourseScene } from './field-course-scene.js';
import { createFieldOpacitySampler } from './field-opacity-sampler.js';
import { sampleFieldPointFrame } from './field-point-frame.js';
import { BOTANY_PLANTS, botanyTarget } from './botany-career.js';

export function botanySiteEligibility(runtime, { points, metersPerUnit: u, ground }) {
  const environment = runtime.worldDiscoveryPublicationStore?.get()?.environment;
  if (environment?.type !== 'EnvironmentContextPublication')
    return 'Wait for the mapped habitat to become ready.';
  const allowed = (point) =>
    environment.cells.some(
      (cell) =>
        point.x >= cell.bounds.minX &&
        point.x <= cell.bounds.maxX &&
        point.z >= cell.bounds.minZ &&
        point.z <= cell.bounds.maxZ &&
        cell.contexts.some((tag) => ['park', 'forest', 'field', 'rural'].includes(tag))
    );
  for (const id of ['a', 'b', 'c', 'plot'])
    for (const [x, z, r] of id === 'plot'
      ? [
          [-1.4, 0, 1.2],
          [1.4, 0, 1.2]
        ]
      : [
          [0, 0, 1],
          [1.1, 0.45, 0.2]
        ]) {
      const p = { x: points[id].x + x / u, z: points[id].z + z / u };
      if (!allowed(p)) return 'Choose a mapped park, woodland or field for the virtual plant beds.';
      for (const dx of [-r, 0, r])
        for (const dz of [-r, 0, r]) {
          const corner = { x: p.x + dx / u, z: p.z + dz / u };
          if (!allowed(corner))
            return 'Keep the full plant-bed footprint inside the mapped habitat.';
          const surface = ground(corner.x, corner.z, 0.15);
          if (!surface) return 'A plant-bed footprint is obstructed or wet.';
          if (Math.abs(surface.y - points[id].y) * u > 0.35)
            return 'Choose gentler ground under the freestanding plant beds.';
        }
    }
  return true;
}
export async function createBotanyPresentation(runtime, qualified, study, options) {
  const scene = createFieldCourseScene(runtime, qualified, 'botany', options),
    { T, u, root, material, mesh, box, at, label, collider } = scene,
    opacity = createFieldOpacitySampler();
  let disposed = false;
  const plantBeds = {},
    quadrats = {},
    footings = [];
  const current = () => !disposed && options.isCurrent?.() !== false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    opacity.dispose();
    scene.dispose();
    options.signal?.removeEventListener('abort', dispose);
  }
  options.signal?.addEventListener('abort', dispose, { once: true });
  const point = (id, x = 0, z = 0) => {
    const p = qualified.points[id];
    return { x: p.x + x / u, y: p.y, z: p.z + z / u };
  };
  const photographSubjects = {};
  try {
    const wood = material(0x715538),
      dark = material(0x263b2b),
      gold = material(0xf0cd75),
      metal = material(0xa0aaa1, { metalness: 0.5, roughness: 0.35 }),
      soilColours = {
        dry: new T.Color(0x9c8056).convertSRGBToLinear(),
        wet: new T.Color(0x3e3726).convertSRGBToLinear()
      };
    const soilMaterial = (index) => {
      const m = material(0xffffff);
      m.color.copy(soilColours.dry).lerp(soilColours.wet, index / 100);
      return m;
    };
    function soilIndex(object, index) {
      object.userData.moistureIndex = index;
      object.material.color.copy(soilColours.dry).lerp(soilColours.wet, index / 100);
    }
    function groundY(x, z) {
      const y = runtime.SurfaceQuery.driveAt(x, z, { preferRoad: false })?.position?.y;
      if (!Number.isFinite(y))
        throw Error(
          'The plant-bed support ground is unavailable. Reopen after the location is ready.'
        );
      return y;
    }
    function support(parent, x, z) {
      const wx = parent.position.x + x / u,
        wz = parent.position.z + z / u,
        y = groundY(wx, wz),
        length = (parent.position.y - y) * u;
      if (length < -0.001)
        throw Error('Ground intersects the plant-bed base. Choose a gentler training site.');
      if (length > 0.001) box(parent, 0.085, length, 0.085, wood, x, -length / 2, z);
      footings.push({ x: wx, z: wz, groundY: y, topY: parent.position.y, bottomY: y });
      return y;
    }
    function levelBed(parent, width, depth) {
      const corners = [
          [-width / 2, -depth / 2],
          [width / 2, -depth / 2],
          [-width / 2, depth / 2],
          [width / 2, depth / 2]
        ],
        ys = corners.map(([x, z]) => groundY(parent.position.x + x / u, parent.position.z + z / u));
      parent.position.y = Math.max(...ys) + 0.025 / u;
      for (const [x, z] of corners) support(parent, x, z);
      return Math.min(...ys);
    }
    function shade(parent, id, light, width = 1.8, depth = 1.5) {
      const cloth = box(
        parent,
        width,
        0.025,
        depth,
        material(0x3b5947, { transparent: true, opacity: 1 - light / 100, side: T.DoubleSide }),
        0,
        2.2,
        0
      );
      cloth.name = 'Virtual reference-light filter · ' + id;
      cloth.userData.botanyLightFilter = true;
      for (const x of [-width / 2, width / 2]) {
        support(parent, x, -depth / 2);
        box(parent, 0.05, 2.2, 0.05, metal, x, 1.1, -depth / 2);
        collider(id + '-shade-post-' + x, 0.035, 0.035, 2.2, {
          x: parent.position.x + x / u,
          y: parent.position.y,
          z: parent.position.z - depth / 2 / u
        });
      }
      collider(id + '-shade', width / 2, depth / 2, 0.04, {
        x: parent.position.x,
        y: parent.position.y + 2.2 / u,
        z: parent.position.z
      });
      return cloth;
    }
    function instruments(parent) {
      const group = new T.Group();
      parent.add(group);
      group.position.set(0.52 / u, 0, 0.38 / u);
      box(group, 0.045, 0.72, 0.045, metal, 0, 0.36);
      box(group, 0.26, 0.16, 0.05, dark, 0, 0.79);
      box(group, 0.2, 0.08, 0.01, gold, 0, 0.8, 0.033);
      const needle = box(group, 0.08, 0.008, 0.008, metal, -0.04, 0.8, 0.045),
        probe = mesh(
          group,
          new T.CylinderGeometry(0.008 / u, 0.008 / u, 0.32 / u, 6),
          metal,
          0,
          0.5,
          0.12
        );
      return { group, needle, probe };
    }
    async function plant(assetId, p, height) {
      const object = await scene.asset(assetId, p, height);
      object.name = 'Botany plant · ' + assetId;
      const entry = { object, assetId, baseScale: object.scale.clone(), base: { ...p } };
      return entry;
    }
    function resize(entry, factor, p = entry.base) {
      entry.object.scale.copy(entry.baseScale).multiplyScalar(factor);
      entry.object.updateWorldMatrix(true, true);
      const b = new T.Box3().setFromObject(entry.object),
        c = b.getCenter(new T.Vector3());
      entry.object.position.add(new T.Vector3(p.x - c.x, p.y - b.min.y, p.z - c.z));
      entry.object.updateWorldMatrix(true, true);
    }
    for (const [id, definition] of Object.entries(BOTANY_PLANTS)) {
      const group = at(id),
        baseY = levelBed(group, 1.8, 1.5),
        soil = box(group, 1.35, 0.055, 1.05, soilMaterial(definition.moisture), 0, 0.335),
        frame = box(group, 1.45, 0.32, 1.15, wood, 0, 0.16);
      soil.name = 'Training soil · ' + id;
      soil.userData.moistureIndex = definition.moisture;
      collider(id, 0.73, 0.58, (group.position.y - baseY) * u + 0.38, {
        x: group.position.x,
        y: baseY,
        z: group.position.z
      });
      const cloth = shade(group, id, definition.light),
        sensor = instruments(group),
        p = { x: group.position.x, y: group.position.y, z: group.position.z };
      soil.updateWorldMatrix(true, true);
      p.y = new T.Box3().setFromObject(soil).max.y;
      const living = await plant(definition.assetId, p, id === 'a' ? 0.75 : id === 'b' ? 1 : 0.6);
      living.object.name = 'Diagnostic training plant ' + id.toUpperCase();
      const labelPoint = point(id, 1.1, 0.45),
        labelGroup = new T.Group();
      labelPoint.y = groundY(labelPoint.x, labelPoint.z);
      labelGroup.position.set(labelPoint.x, labelPoint.y, labelPoint.z);
      root.add(labelGroup);
      box(labelGroup, 0.045, 1.3, 0.045, wood, 0, 0.65);
      label(labelGroup, `PLANT ${id.toUpperCase()}\nVirtual comparison bed`, 0, 1.4, 0, 1, 0.35);
      collider(id + '-label', 0.04, 0.04, 1.6, labelPoint);
      photographSubjects[`plant-${id}`] = {
        id: `${qualified.site.id}:plant:${id}`,
        objects: [living.object]
      };
      plantBeds[id] = { group, soil, frame, cloth, sensor, living };
    }
    const plot = at('plot');
    for (const [id, x] of [
      ['control', -1.4],
      ['treatment', 1.4]
    ]) {
      const group = new T.Group();
      group.position.set(plot.position.x + x / u, plot.position.y, plot.position.z);
      root.add(group);
      group.name = 'Botany ' + id + ' quadrat';
      const baseY = levelBed(group, 1.9, 1.9);
      box(group, 1.85, 0.32, 1.85, wood, 0, 0.16);
      const soil = box(group, 1.75, 0.05, 1.75, soilMaterial(65), 0, 0.34);
      soil.name = id + ' soil';
      soil.userData.moistureIndex = 65;
      collider('plot-' + id, 0.93, 0.93, (group.position.y - baseY) * u + 0.4, {
        x: group.position.x,
        y: baseY,
        z: group.position.z
      });
      const plants = [];
      for (const [dx, dz] of [
        [-0.37, -0.28],
        [0.35, 0.34]
      ]) {
        const p = {
          x: group.position.x + dx / u,
          y: group.position.y + 0.365 / u,
          z: group.position.z + dz / u
        };
        plants.push(await plant('nature-grass', p, 0.55));
      }
      const stakes = new T.Group();
      group.add(stakes);
      for (const dx of [-0.8, 0.8])
        for (const dz of [-0.8, 0.8]) box(stakes, 0.035, 0.65, 0.035, gold, dx, 0.5, dz);
      const pins = [];
      for (let index = 0; index < 16; index++) {
        const localX = (((index % 4) + 0.5) / 4 - 0.5) * 1.6,
          localZ = ((Math.floor(index / 4) + 0.5) / 4 - 0.5) * 1.6,
          rod = box(group, 0.006, 1, 0.006, metal, localX, 1, localZ);
        rod.visible = false;
        pins.push(rod);
      }
      const sensor = instruments(group),
        cloth = shade(group, 'plot-' + id, 60, 1.9, 1.9);
      label(
        group,
        id === 'control' ? 'UNTREATED COMPARISON' : 'TREATMENT',
        0,
        0.48,
        1.02,
        1.3,
        0.26
      );
      quadrats[id] = {
        group,
        soil,
        plants,
        stakes,
        pins,
        sensor,
        cloth,
        center: { x: group.position.x, z: group.position.z },
        soilTop: group.position.y + 0.365 / u
      };
    }
    const target = quadrats.treatment,
      p = { x: target.center.x, y: target.soilTop, z: target.center.z },
      restoration = await plant(
        BOTANY_PLANTS[study.suitable].assetId,
        p,
        study.suitable === 'a' ? 0.75 : study.suitable === 'b' ? 0.9 : 0.65
      );
    restoration.object.name = 'Saved restoration planting';
    restoration.object.visible = false;
    await scene.table('bench');
    label(
      at('bench'),
      'PLANT COMPARISON\nPhotographs · fixed plots · virtual seasons',
      0,
      1.6,
      0,
      2.4,
      0.6
    );
    const marker = mesh(root, new T.TorusGeometry(0.65 / u, 0.02 / u, 5, 40), gold);
    marker.rotation.x = -Math.PI / 2;
    function guard(id) {
      const actor = runtime.Walk?.state?.walker,
        p = qualified.points[id];
      if (
        !current() ||
        runtime.getEnv?.() !== 'EARTH' ||
        runtime.getCurrentTravelMode?.() !== 'walk' ||
        runtime.worldLoading ||
        runtime.activeInterior ||
        runtime.getLiveGpsSnapshot?.().active ||
        !root.parent ||
        !actor ||
        Math.hypot(actor.x - p.x, actor.z - p.z) * u > 3
      )
        throw Error('Return to this supported outdoor station before using the instrument.');
      const ground = runtime.SurfaceQuery?.walkAt?.(actor.x, actor.z, { currentY: actor.y });
      if (!Number.isFinite(ground?.position?.y) || Math.abs(actor.y - ground.position.y) * u > 2.5)
        throw Error('Stand on supported ground to take the reading.');
    }
    function sensorReading(bed, depthCm) {
      if (!Number.isFinite(depthCm) || depthCm < 0 || depthCm > 15)
        throw Error('Set a probe depth between zero and fifteen centimetres.');
      bed.soil.updateWorldMatrix(true, true);
      const top = new T.Box3().setFromObject(bed.soil).max.y,
        probe = bed.sensor.probe;
      // The probe geometry is .32m long. Its lower tip, not its centre, carries depth.
      probe.position.y =
        top - bed.sensor.group.getWorldPosition(new T.Vector3()).y + 0.16 / u - depthCm / 100 / u;
      probe.updateWorldMatrix(true, true);
      const probeTip = probe.getWorldPosition(new T.Vector3()).y - 0.16 / u,
        measuredDepth = Number(((top - probeTip) * u * 100).toFixed(1));
      bed.cloth.updateWorldMatrix(true, true);
      bed.sensor.group.updateWorldMatrix(true, true);
      const origin = bed.sensor.group.getWorldPosition(new T.Vector3());
      origin.y = top + 0.9 / u;
      const ray = new T.Raycaster(origin, new T.Vector3(0, 1, 0), 0, 3 / u),
        filter = ray.intersectObject(bed.cloth, false)[0],
        light = filter ? Number(((1 - bed.cloth.material.opacity) * 100).toFixed(1)) : 100;
      bed.sensor.needle.rotation.z = -Math.PI / 3 + (((Math.PI * 2) / 3) * light) / 100;
      return {
        truthType: 'authored-virtual-bed',
        method: 'paired-training-sensors',
        depthCm: measuredDepth,
        light,
        moisture: bed.soil.userData.moistureIndex,
        units: { light: 'relative-index', moisture: 'relative-index' },
        supported: true
      };
    }
    function readPlant(id, depthCm = 5) {
      guard(id);
      const a = options.getState().active;
      return {
        plantId: id,
        runId: a.runId,
        siteId: a.site.id,
        ...sensorReading(plantBeds[id], depthCm),
        at: Date.now()
      };
    }
    function readCondition(depthCm = 5) {
      guard('plot');
      const a = options.getState().active;
      return {
        runId: a.runId,
        siteId: a.site.id,
        virtualSeason: a.currentSeason,
        ...sensorReading(quadrats.treatment, depthCm),
        at: Date.now()
      };
    }
    function readPlot(phase) {
      guard('plot');
      const a = options.getState().active,
        result = {
          runId: a.runId,
          siteId: a.site.id,
          phase,
          virtualSeason: a.currentSeason,
          truthType: 'declared-season-simulation',
          method: 'vertical-point-intercept',
          gridKey: 'fixed-four-by-four-v1',
          sideMeters: 1.6
        };
      for (const id of ['control', 'treatment']) {
        const q = quadrats[id],
          plants = Object.values(quadrats).flatMap((row) =>
            row.plants.map((plant) => plant.object)
          );
        if (restoration.object.visible) plants.push(restoration.object);
        result[id] = sampleFieldPointFrame({
          THREE: T,
          plants,
          soil: q.soil,
          center: q.center,
          metersPerUnit: u,
          sideMeters: 1.6,
          opacity
        });
        for (const point of result[id].points) {
          const pin = q.pins[point.index];
          pin.position.y = point.hitY - q.group.position.y + 0.5 / u;
          pin.visible = true;
        }
      }
      result.at = Date.now();
      return result;
    }
    let cursor = '';
    function update(active) {
      const next = [
        active.currentSeason,
        active.planting?.variety || '',
        active.planting?.cell ?? '',
        !!active.markedAt
      ].join(':');
      if (cursor !== next) {
        const stage =
            active.currentSeason === study.initialSeason
              ? 'baseline'
              : active.currentSeason === study.visitSeason
                ? 'visit'
                : 'followup',
          factor =
            stage === 'baseline' ? 1 : stage === 'visit' ? study.visitScale : study.afterScale;
        for (const q of Object.values(quadrats)) {
          for (const plant of q.plants) resize(plant, factor);
          q.stakes.visible = !!active.markedAt;
          soilIndex(q.soil, stage === 'baseline' ? 65 : study.plotMoisture);
          q.cloth.material.opacity = 1 - (stage === 'baseline' ? 60 : study.plotLight) / 100;
        }
        restoration.object.visible = !!active.planting;
        if (active.planting) {
          const cell = active.planting.cell,
            target = quadrats.treatment,
            p = {
              x: target.center.x + ((((cell % 4) + 0.5) / 4 - 0.5) * 1.6) / u,
              y: target.soilTop,
              z: target.center.z + (((Math.floor(cell / 4) + 0.5) / 4 - 0.5) * 1.6) / u
            };
          resize(restoration, stage === 'followup' ? 1.15 : 0.65, p);
        }
        cursor = next;
      }
      const p = qualified.points[botanyTarget(active)];
      marker.position.set(p.x, p.y + 0.04 / u, p.z + 1.35 / u);
      marker.visible = active.phase !== 'complete';
    }
    scene.attach();
    update(options.getState().active);
    return {
      root,
      photoSubjects: photographSubjects,
      opacity,
      plantBeds,
      quadrats,
      restoration,
      footings,
      readPlant,
      readPlot,
      readCondition,
      update,
      dispose,
      get budget() {
        return { ...scene.budget(), opacity: opacity.snapshot() };
      }
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
