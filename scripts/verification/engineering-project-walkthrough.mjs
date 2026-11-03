import assert from 'node:assert/strict';
export async function completeEngineeringProjects({
  qa,
  output,
  save,
  home,
  action,
  panel,
  focus,
  beginVariant,
}) {
  const { page } = qa;
  for (const variant of ['campaign', 'room-to-work', 'reusable-design']) {
    if ((await home()).workspace.projects?.reports?.[variant]) continue;
    if ((await home()).variantId !== variant) {
      await beginVariant(variant);
      await panel();
    }
    if ((await home()).workspace.projects.active.phase === 'inspect') {
      const decision = await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55'),
          { getPersonalHousing } = await import('/app/js/game/property-ui.js?v=9'),
          { engineeringRoom, engineeringProposal } = await import(
            '/app/js/campaign/engineering-workspace.js'
          );
        const h = getPersonalHousing()
          .snapshot()
          .homes.find((h) => h.id === ctx.worldDiscoveryRuntime.personalHome.snapshot().homeId);
        return ctx.worldDiscoveryRuntime.personalHome.snapshot().variantId === 'reusable-design'
          ? 'check-room-fit'
          : engineeringProposal(engineeringRoom(ctx, h)).constraint;
      });
      await action('inspect:' + decision);
      assert.equal((await home()).workspace.projects.active.phase, 'arrange');
      await save(variant + ' · actual room inspection saved');
    }
    if (variant === 'campaign' && !(await home()).workspace.pose) {
      await action('place');
      await page.waitForFunction(() => window.__engineeringHome().furnitureReady);
      await action('rotate');
      await action('undo');
    }
    if (variant === 'room-to-work' || variant === 'reusable-design') {
      let a = (await home()).workspace.projects.active;
      if (variant === 'reusable-design' && !a.exported) {
        const download = page.waitForEvent('download');
        await action('export');
        await (await download).saveAs(output + '/world-explorer-workspace.json');
        await save('Original reusable design exported');
      }
      a = (await home()).workspace.projects.active;
      const pose = (await home()).workspace.pose,
        needsTrial =
          variant === 'reusable-design'
            ? !a.trialPose
            : Math.hypot(pose.x - a.startingPose.x, pose.z - a.startingPose.z) < 0.49 &&
              pose.turn === a.startingPose.turn;
      if (needsTrial) {
        let moved = false;
        for (const id of ['left', 'right', 'forward', 'back', 'rotate']) {
          const rev = (await home()).revision;
          await action(id);
          if ((await home()).revision > rev) {
            moved = true;
            break;
          }
        }
        assert.ok(moved, 'A distinct supported arrangement exists');
        await save(variant + ' · distinct valid arrangement');
      }
      if (variant === 'reusable-design' && !(await home()).workspace.projects.active.importedAt) {
        const file = (await home()).workspace.projects.active.exported.design;
        await page.locator('[data-home-import]').setInputFiles({
          name: 'world-explorer-workspace.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(file)),
        });
        await page.waitForFunction(
          () =>
            !window.__engineeringHome().busy &&
            !!window.__engineeringHome().workspace.projects.active.importedAt
        );
        await save('Original exported file restored through native file input');
      }
    }
    await page.waitForFunction(() => window.__engineeringHome().furnitureReady);
    const use = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { workspaceGeometry } = await import('/app/js/campaign/personal-workspace.js');
      return workspaceGeometry(
        ctx.activeInterior,
        ctx.worldDiscoveryRuntime.personalHome.snapshot().workspace.pose
      ).use;
    });
    await focus();
    if (!(await home()).interactionReady) await qa.walkTo(use, 0.95);
    assert.equal(
      (await home()).interactionReady,
      true,
      'The supported actor can use the actual desk'
    );
    await page.keyboard.press('e');
    await page.locator('[data-home-action="review"]').waitFor();
    await action('review');
    assert.ok((await home()).workspace.projects.reports[variant], (await home()).message);
    await save(variant + ' · actual supported desk use and immutable Journal design');
    await page.screenshot({ path: output + '/' + variant + '-complete.png' });
  }
}
