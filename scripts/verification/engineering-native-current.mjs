import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = 'output/verification/engineering-career-20261103/native-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'engineering',
    maximumDurationMs: 180000,
  }),
  { page, report } = qa;
async function action(id) {
  await page.locator(`[data-home-action="${id}"]`).click();
  await page.waitForFunction(() => !fixture.runtime.snapshot().busy);
}
try {
  report.scope =
    'Controlled room: actual retained home runtime, native buttons/file controls, IndexedDB, possessions storage and project publication failure/reload. Room support is controlled, not mapped-city gameplay; accepted H04 furniture/collision matrix is reused.';
  if (process.env.WE3D_ENGINEERING_NATIVE_MODE === 'reload') {
    const source = 'output/verification/engineering-career-20261103/native-1793736672585',
      backup = JSON.parse(await fs.readFile(source + '/qa-fieldwork-failed-backup.json')),
      possessions = JSON.parse(await fs.readFile(source + '/possessions.json')),
      expected = backup.events.find((e) => e.metadata?.workspaceDesignReport).metadata
        .workspaceDesignReport;
    report.source = source;
    report.reusedChecks = [
      'native-1793736524240 quota/inspection rollback prefix',
      'native-1793736672585 saved layout / failed Journal write / actual retry prefix',
    ];
    await page.addInitScript(
      ({ backup, possessions }) => {
        globalThis.__skipOpeningChapterFixture = true;
        globalThis.__fieldworkBackup = backup;
        localStorage.setItem('world-explorer:character-backpack:v3', JSON.stringify(possessions));
      },
      { backup, possessions }
    );
    await page.goto('http://127.0.0.1:4192/scripts/verification/fixtures/personal-workspace.html');
    await page.waitForFunction(
      () => !!globalThis.fixture && fixture.runtime.snapshot().furnitureReady
    );
    await page.evaluate(() => fixture.runtime.refresh());
    await page.evaluate(() => fixture.runtime.refresh());
    assert.deepEqual(
      await page.evaluate(() => fixture.runtime.snapshot().workspace.projects.reports.campaign),
      expected
    );
    const current = await page.evaluate(() => fixture.store.exportData());
    assert.equal(current.events.filter((e) => e.metadata?.workspaceDesignReport).length, 1);
    assert.equal(current.events.filter((e) => e.metadata?.chapterId === 'useful-place').length, 1);
    report.checks.push(
      'genuine completed native checkpoint reloads through current readers without another report or Maker receipt'
    );
    await fs.writeFile(output + '/qa-fieldwork-backup.json', JSON.stringify(current) + '\n', {
      mode: 0o600,
    });
    await fs.writeFile(
      output + '/possessions.json',
      (await page.evaluate(() => localStorage.getItem('world-explorer:character-backpack:v3'))) +
        '\n',
      { mode: 0o600 }
    );
  } else {
    await page.addInitScript(() => {
      globalThis.__skipOpeningChapterFixture = true;
    });
    await page.goto('http://127.0.0.1:4192/scripts/verification/fixtures/personal-workspace.html');
    await page.waitForFunction(() => !!globalThis.fixture && !fixture.runtime.snapshot().busy);
    await page.evaluate(async () => {
      fixture.walker.onGround = true;
      fixture.ctx.LOC = { lat: 39.2904, lon: -76.6122, name: 'Controlled room' };
      await fixture.store.saveProfile((p) => ({
        ...p,
        activeExperience: {
          schemaVersion: 1,
          definitionVersion: 1,
          experienceId: 'career:field-engineer',
          variantId: 'campaign',
        },
      }));
      await fixture.runtime.startCareer({ variantId: 'campaign', isActive: () => true });
    });
    const inspect = await page.evaluate(async () => {
      const { engineeringRoom, engineeringProposal } = await import(
        '/app/js/campaign/engineering-workspace.js'
      );
      return engineeringProposal(engineeringRoom(fixture.ctx, fixture.housing.snapshot().homes[0]))
        .constraint;
    });
    if (process.env.WE3D_ENGINEERING_NATIVE_MODE !== 'publication') {
      const before = await page.evaluate(() => fixture.runtime.snapshot().workspace);
      await page.evaluate(() => {
        window.__set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
          if (k === 'world-explorer:character-backpack:v3')
            throw new DOMException('Controlled project save failure', 'QuotaExceededError');
          return __set.call(this, k, v);
        };
      });
      await action('inspect:' + inspect);
      assert.deepEqual(await page.evaluate(() => fixture.runtime.snapshot().workspace), before);
      assert.equal(await page.evaluate(() => fixture.runtime.snapshot().saveFailed), true);
      report.checks.push('failed new inspection commit keeps the exact prior workspace');
      await page.evaluate(() => (Storage.prototype.setItem = __set));
      await action('retry');
    } else
      report.reusedInspectionFailure =
        'native-1793736524240/failed.json · accepted quota/rollback prefix';
    await action('inspect:' + inspect);
    assert.equal(
      await page.evaluate(() => fixture.runtime.snapshot().workspace.projects.active.phase),
      'arrange'
    );
    // Ordinary H04 arrangement is setup, not a repeated collision/placement acceptance.
    await action('place');
    await page.waitForFunction(() => fixture.runtime.snapshot().furnitureReady);
    await action('rotate');
    await action('undo');
    await page.waitForFunction(() => fixture.runtime.snapshot().furnitureReady);
    await page.evaluate(async () => {
      const { workspaceGeometry } = await import('/app/js/campaign/personal-workspace.js');
      const use = workspaceGeometry(fixture.active, fixture.runtime.snapshot().workspace.pose).use;
      Object.assign(fixture.walker, { x: use.x, z: use.z, y: use.y + 1.7, onGround: true });
      window.__put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (row, ...rest) {
        if (this.name === 'events' && row.metadata?.workspaceDesignReport)
          throw new DOMException('Controlled Journal save failure', 'QuotaExceededError');
        return __put.call(this, row, ...rest);
      };
    });
    await page.evaluate(() => fixture.state.ui.setOpen(false));
    await page.waitForFunction(() => fixture.runtime.snapshot().interactionReady);
    await page.keyboard.press('e');
    await page.locator('[data-home-action="review"]').waitFor();
    await action('review');
    const saved = await page.evaluate(
      () => fixture.runtime.snapshot().workspace.projects.reports.campaign
    );
    assert.ok(saved);
    assert.equal(await page.evaluate(() => fixture.runtime.snapshot().saveFailed), true);
    assert.equal(
      (await page.evaluate(() => fixture.store.exportData())).events.filter(
        (e) => e.metadata?.workspaceDesignReport
      ).length,
      0
    );
    report.checks.push('successful home commit survives a failed Journal publication');
    await page.evaluate(() => (IDBObjectStore.prototype.put = __put));
    await action('retry');
    const backup = await page.evaluate(() => fixture.store.exportData());
    assert.equal(backup.events.filter((e) => e.metadata?.workspaceDesignReport).length, 1);
    assert.deepEqual(
      await page.evaluate(() => fixture.runtime.snapshot().workspace.projects.reports.campaign),
      saved
    );
    await page.evaluate(() => fixture.runtime.refresh());
    assert.equal(
      (await page.evaluate(() => fixture.store.exportData())).events.filter(
        (e) => e.metadata?.workspaceDesignReport
      ).length,
      1
    );
    report.checks.push(
      'retry publishes the exact saved design once without another project or reward'
    );
    await page.reload();
    await page.waitForFunction(() => !!globalThis.fixture);
    const after = await page.evaluate(
      () => fixture.runtime.snapshot().workspace.projects.reports.campaign
    );
    assert.deepEqual(after, saved);
    assert.equal(
      (await page.evaluate(() => fixture.store.exportData())).events.filter(
        (e) => e.metadata?.workspaceDesignReport
      ).length,
      1
    );
    report.checks.push('native reload retains possessions and the once-only IndexedDB result');
    await fs.writeFile(
      output + '/qa-fieldwork-backup.json',
      JSON.stringify(await page.evaluate(() => fixture.store.exportData())) + '\n',
      { mode: 0o600 }
    );
    await fs.writeFile(
      output + '/possessions.json',
      (await page.evaluate(() => localStorage.getItem('world-explorer:character-backpack:v3'))) +
        '\n',
      { mode: 0o600 }
    );
  }
  assert.deepEqual(report.errors, []);
  await qa.succeed();
} catch (error) {
  try {
    await fs.writeFile(
      output + '/qa-fieldwork-failed-backup.json',
      JSON.stringify(await page.evaluate(() => fixture.store.exportData())) + '\n',
      { mode: 0o600 }
    );
    await fs.writeFile(
      output + '/possessions.json',
      (await page.evaluate(() => localStorage.getItem('world-explorer:character-backpack:v3'))) +
        '\n',
      { mode: 0o600 }
    );
  } catch {}
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
