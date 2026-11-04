import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = 'output/verification/meteorology-career-20261103/instrument-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'meteorology',
    maximumDurationMs: 120000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Controlled actual WebGL rotor/vane/sky/shelter geometry and support/disposal at actual source unit1.11. No field clock, profile save, or source-world completion claim.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/meteorology-presentation.html'
  );
  await page.waitForFunction(() => window.ready);
  report.cases = [];
  for (const id of ['campaign', 'freshening', 'turning-north']) {
    const row = await page.evaluate(async (id) => {
      const v = weatherVisual,
        { meteorologyReading } = await import('/app/js/campaign/meteorology-career.js');
      await v.setup(id);
      const rows = [];
      for (const after of [false, true]) {
        v.condition(after);
        for (const station of ['a', 'b']) {
          const samples = [],
            initial = v.start(station);
          samples.push({ activeSeconds: 0, ...initial.sample });
          for (const t of [4, 8]) {
            const r = v.step(4);
            samples.push({ activeSeconds: t, ...r.sample });
          }
          rows.push({
            after,
            station,
            value: meteorologyReading({ samples, heightMeters: initial.heightMeters }),
          });
        }
      }
      const feet = v.feet(),
        budget = v.presentation.budget;
      v.face();
      v.render();
      return {
        id,
        rows,
        budget,
        supportCount: feet.length,
        maximumFootGap: Math.max(...feet.map((f) => Math.abs(f.actualY - f.groundY))),
      };
    }, id);
    report.currentCase = row;
    const expected = {
      campaign: [
        [4, 1.4, 270, 3],
        [4.4, 1.54, 280, 4],
      ],
      freshening: [
        [3, 1.05, 260, 2],
        [7, 2.45, 250, 7],
      ],
      'turning-north': [
        [4, 4, 350, 4],
        [4, 4, 10, 2],
      ],
    }[id];
    for (const r of row.rows) {
      const e = expected[Number(r.after)];
      assert.ok(Math.abs(r.value.speed - e[r.station === 'a' ? 0 : 1]) < 1e-6, JSON.stringify(r));
      assert.ok(Math.abs(r.value.fromDeg - e[2]) < 1e-6);
      assert.ok(Math.abs(r.value.cloudPercent - (e[3] / 9) * 100) < 1e-6);
      assert.ok(Math.abs(r.value.heightMeters - 2) < 1e-6);
    }
    assert.ok(row.maximumFootGap < 1e-5, JSON.stringify(row));
    report.cases.push(row);
    await page.screenshot({ path: output + '/' + id + '-supported-rigs.png' });
  }
  report.mutations = await page.evaluate(async () => {
    const v = weatherVisual,
      { meteorologyReading } = await import('/app/js/campaign/meteorology-career.js');
    await v.setup('campaign');
    v.start('b');
    const before = v.presentation.read(),
      old = v.presentation.screens.position.x;
    v.presentation.screens.position.x -= 4 / v.qualified.metersPerUnit;
    v.presentation.root.updateWorldMatrix(true, true);
    const changed = v.presentation.read();
    v.presentation.screens.position.x = old;
    v.presentation.root.updateWorldMatrix(true, true);
    v.start('a');
    const f = v.presentation.frames.a,
      cellsBefore = v.presentation.read().sample.cloudPaths.filter((p) => p.covered).length;
    f.cells[0].puff.visible = false;
    const cellsChanged = v.presentation.read().sample.cloudPaths.filter((p) => p.covered).length;
    f.cells[0].puff.visible = true;
    const original = f.vane.rotation.y;
    f.vane.rotation.y = -Math.PI / 2;
    v.presentation.root.updateWorldMatrix(true, true);
    const s = v.presentation.read(),
      bearing = meteorologyReading({
        samples: [
          { activeSeconds: 0, ...s.sample },
          { activeSeconds: 4, ...s.sample, rotorAngle: 1 },
          { activeSeconds: 8, ...s.sample, rotorAngle: 2 },
        ],
        heightMeters: s.heightMeters,
      }).fromDeg;
    f.vane.rotation.y = original;
    const samples = [
      { activeSeconds: 0, ...v.start('a').sample },
      { activeSeconds: 4, ...v.step(4).sample },
    ];
    v.step(4);
    f.rotor.rotation.y += Math.PI;
    const last = v.presentation.read();
    samples.push({ activeSeconds: 8, ...last.sample });
    const changedSpeed = meteorologyReading({ samples, heightMeters: last.heightMeters }).speed;
    const b = v.qualified.points.b,
      c = v.runtime.camera;
    c.position.set(
      b.x + 2 / v.qualified.metersPerUnit,
      2.8 / v.qualified.metersPerUnit,
      b.z + 3 / v.qualified.metersPerUnit
    );
    c.lookAt(b.x, 1.2 / v.qualified.metersPerUnit, b.z);
    c.updateMatrixWorld(true);
    v.render();
    return {
      blockedBefore: before.sample.exposurePaths.filter((p) => p.blocked).length,
      blockedAfter: changed.sample.exposurePaths.filter((p) => p.blocked).length,
      cellsBefore,
      cellsChanged,
      bearing,
      changedSpeed,
    };
  });
  assert.equal(report.mutations.blockedBefore, 4);
  assert.equal(report.mutations.blockedAfter, 0);
  assert.equal(report.mutations.cellsBefore, 3);
  assert.equal(report.mutations.cellsChanged, 2);
  assert.ok(Math.abs(report.mutations.bearing - 90) < 1e-6);
  assert.ok(Math.abs(report.mutations.changedSpeed - 4.75) < 1e-6);
  await page.screenshot({ path: output + '/shelter-and-working-sensor-closeup.png' });
  report.disposal = await page.evaluate(() => weatherVisual.dispose());
  assert.deepEqual(report.disposal, { attached: false, colliders: 0 });
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
