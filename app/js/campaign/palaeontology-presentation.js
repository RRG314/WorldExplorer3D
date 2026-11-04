import { createFieldCourseScene } from './field-course-scene.js';
import { palaeontologyTarget } from './palaeontology-career.js';
export async function createPalaeontologyPresentation(runtime, qualified, study, options) {
  const scene = createFieldCourseScene(runtime, qualified, 'palaeontology', options),
    { T, u, root, material, mesh, box, at, label, collider } = scene;
  try {
    const frame = material(0x665440),
      matrix = material(study.colour),
      cast = material(0x99764b),
      shadow = material(0x3c3021),
      bed = at('bed');
    box(bed, 3.1, 0.12, 1.5, frame, 0, 0.15);
    const formation = new T.Group();
    formation.name = 'Fossil surrounding layer';
    bed.add(formation);
    for (let i = 0; i < 3; i++)
      box(
        formation,
        2.8,
        0.25,
        1.2,
        material(i === 2 ? study.colour : i === 1 ? 0x514434 : 0x706455),
        0,
        0.35 + i * 0.25
      );
    // Permanent sediment section; exposure removes only the bounded top patches.
    for (let i = 0; i < 14; i++) {
      const line = box(formation, 2.65, 0.008, 0.007, shadow, 0, 0.28 + i * 0.047, 0.604);
      if (study.sediment === 'cross-bedded-sand') line.rotation.z = 0.1;
    }
    if (study.sediment === 'fine-carbonate')
      for (let i = 0; i < 16; i++) {
        const chip = mesh(
          formation,
          new T.SphereGeometry(0.025 / u, 5, 3),
          cast,
          -1.2 + ((i * 29) % 24) / 10,
          0.45 + ((i * 7) % 5) / 10,
          0.615
        );
        chip.scale.set(1, 0.4, 0.35);
      }
    const northMarker = new T.Group();
    bed.add(northMarker);
    box(northMarker, 0.018, 0.009, 0.42, material(0xf6d17c), 0.38, 0.993, 0);
    box(northMarker, 0.13, 0.012, 0.025, cast, 0.38, 0.999, -0.18);
    label(northMarker, 'N', 0.38, 1.025, -0.27, 0.16, 0.1);
    label(
      bed,
      `${study.layer} · ${study.sediment.replaceAll('-', ' ')}\n0.5 m scale bar`,
      0,
      0.55,
      0.69,
      1.0,
      0.28
    );
    box(bed, 0.5, 0.01, 0.018, cast, 0.52, 0.987, 0.43);
    for (const x of [0.27, 0.77]) box(bed, 0.015, 0.012, 0.075, shadow, x, 0.995, 0.43);
    function fossil(parent) {
      const group = new T.Group();
      parent.add(group);
      if (study.kind === 'coiled-shell') {
        const points = [];
        for (let i = 0; i <= 112; i++) {
          const t = (i / 112) * Math.PI * 4.6,
            r = 0.013 + 0.015 * t;
          points.push(new T.Vector3((Math.cos(t) * r) / u, 0.016 / u, (Math.sin(t) * r) / u));
        }
        mesh(
          group,
          new T.TubeGeometry(new T.CatmullRomCurve3(points), 112, 0.025 / u, 6, false),
          cast
        );
        for (let i = 14; i < points.length; i += 4) {
          const p = points[i],
            rib = mesh(
              group,
              new T.TorusGeometry(0.027 / u, 0.0025 / u, 3, 12),
              shadow,
              p.x * u,
              0.016,
              p.z * u
            );
          rib.rotation.y = (-i / 112) * Math.PI * 4.6;
        }
      } else if (study.kind === 'leaf') {
        const shape = new T.Shape();
        shape.moveTo(0, -0.3 / u);
        shape.bezierCurveTo(0.24 / u, -0.16 / u, 0.19 / u, 0.2 / u, 0, 0.38 / u);
        shape.bezierCurveTo(-0.19 / u, 0.2 / u, -0.24 / u, -0.16 / u, 0, -0.3 / u);
        const leaf = mesh(group, new T.ShapeGeometry(shape, 12), material(0x594d3e), 0, 0.009);
        leaf.rotation.x = -Math.PI / 2;
        box(group, 0.009, 0.006, 0.62, cast, 0, 0.018, 0.02);
        for (let i = 0; i < 5; i++)
          for (const side of [-1, 1]) {
            const vein = box(group, 0.16, 0.006, 0.006, cast, side * 0.07, 0.021, -0.18 + i * 0.09);
            vein.rotation.y = side * -0.55;
          }
      } else {
        for (const side of [-1, 1]) {
          const valve = mesh(
            group,
            new T.SphereGeometry(0.2 / u, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2),
            cast,
            side * 0.15,
            0.006,
            0
          );
          valve.scale.set(0.8, 0.28, 1);
          for (let i = 0; i < 9; i++) {
            const rib = box(
              group,
              0.006,
              0.008,
              0.28,
              shadow,
              side * 0.15 + Math.sin(i * 0.32) * 0.13,
              0.055,
              0
            );
            rib.rotation.y = (i - 4) * 0.13;
          }
        }
        // A missing edge is kept as a dark discontinuity, not polished smooth.
        box(group, 0.11, 0.012, 0.07, matrix, 0.29, 0.06, 0.11);
      }
      group.rotation.y =
        study.orientation === 'east-west'
          ? Math.PI * 4.6
          : study.orientation === 'north-east-south-west'
            ? Math.PI / 4
            : 0;
      return group;
    }
    const specimen = fossil(bed);
    specimen.name = 'Fossil orientation subject';
    specimen.position.set(-0.26 / u, 0.989 / u, 0);
    // Small, bounded preparation patches cover margins, not the visible form.
    const outer = box(bed, 0.36, 0.035, 0.43, matrix, -0.67, 1.003, 0),
      margin = box(bed, 0.12, 0.018, 0.36, matrix, -0.48, 1.002, 0);
    label(bed, 'FOSSIL BED\nInvented training cast', 0, 1.55, -0.55, 1.2, 0.33);
    collider('bed', 1.58, 0.78, 1.02);
    await scene.table('bench');
    const bench = at('bench'),
      tray = box(bench, 0.8, 0.04, 0.55, material(0xcebd96), 0, 0.94);
    const packed = fossil(bench);
    packed.name = 'Prepared fossil specimen';
    packed.position.set(0, 0.985 / u, 0);
    const support = box(bench, 0.66, 0.12, 0.42, matrix, 0, 1.02);
    support.name = 'Supported sediment block';
    support.visible = false;
    if (study.support === 'supported-block') {
      // Fit the support to the specimen's actual footprint. The longer leaf
      // axis lies across the bench; its recorded in-situ axis stays unchanged.
      packed.rotation.y += Math.PI / 2;
      packed.position.y = 0;
      root.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(packed),
        origin = bench.getWorldPosition(new T.Vector3()),
        size = bounds.getSize(new T.Vector3()).multiplyScalar(u),
        center = bounds.getCenter(new T.Vector3()).sub(origin).multiplyScalar(u);
      const width = size.x + 0.08,
        depth = size.z + 0.08;
      support.scale.set(width / 0.66, 1, depth / 0.42);
      support.position.x = center.x / u;
      support.position.z = center.z / u;
      tray.scale.set(Math.max(0.8, width + 0.08) / 0.8, 1, Math.max(0.55, depth + 0.08) / 0.55);
      tray.position.x = center.x / u;
      tray.position.z = center.z / u;
      packed.position.y = (1.08 - (bounds.min.y - origin.y) * u + 0.001) / u;
    }
    const probe = box(
      bench,
      0.19,
      0.012,
      0.012,
      material(0x9eabb0, { metalness: 0.6, roughness: 0.4 }),
      0.51,
      0.94,
      0
    );
    label(bench, 'COMPARISON BENCH\nKeep the specimen’s context', 0, 1.65, -0.35, 1.4, 0.39);
    const ring = mesh(
      root,
      new T.TorusGeometry(1 / u, 0.025 / u, 5, 48),
      scene.resource(
        new T.MeshBasicMaterial({
          color: 0xf0ce7e,
          transparent: true,
          opacity: 0.9,
          depthWrite: false
        })
      )
    );
    ring.rotation.x = -Math.PI / 2;
    function update(active) {
      specimen.visible = !active.specimen;
      outer.visible = active.preparation.length < 1;
      margin.visible = active.preparation.length < 2;
      packed.visible =
        !!active.specimen &&
        !!runtime.playerBackpackInventory?.item?.(active.specimen.instanceId)?.quantity;
      tray.visible = packed.visible;
      support.visible = packed.visible && study.support === 'supported-block';
      const p = qualified.points[palaeontologyTarget(active)];
      ring.position.set(
        p.x,
        p.y + 0.05 / u,
        p.z + (palaeontologyTarget(active) === 'bed' ? 2 : 1.3) / u
      );
      ring.visible = active.phase !== 'complete';
    }
    scene.attach();
    return {
      root,
      update,
      dispose: scene.dispose,
      budget: scene.budget(),
      photoSubjects: {
        layer: { id: `${qualified.site.id}:layer`, objects: [formation] },
        orientation: {
          id: `${qualified.site.id}:orientation`,
          objects: [specimen, northMarker],
          requireAll: true
        }
      }
    };
  } catch (error) {
    scene.dispose();
    throw error;
  }
}
