import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = 'output/verification/accelerator-career-20261103/admission-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'accelerator',
    maximumDurationMs: 390000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Only the two new mapped CERN facility preconditions in actual loaded Earth worlds, through existing publication and building-entry support. Normal URL geographic arrival; no field methods, room traversal or career completion claimed.';
  report.sites = [];
  const sites = [
    { id: 'cern-science-gateway', lat: 46.23361, lon: 6.0562 },
    { id: 'cms-point-five', lat: 46.30945, lon: 6.0773 },
  ];
  for (const site of process.env.WE3D_CERN_SITE
    ? sites.filter((s) => s.id === process.env.WE3D_CERN_SITE)
    : sites) {
    await page.goto(
      'http://127.0.0.1:4192/app/?lat=' +
        site.lat +
        '&lon=' +
        site.lon +
        '&name=' +
        encodeURIComponent(site.id) +
        '&diagnostics=1'
    );
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      window.cernAdmissionReady = () =>
        ctx.gameStarted &&
        !ctx.worldLoading &&
        !!ctx.worldPublication?.requestId &&
        !document.querySelector('#loading')?.classList.contains('show');
    });
    const end = Date.now() + 180000;
    while (!(await page.evaluate(() => cernAdmissionReady()))) {
      if (Date.now() > end) throw Error('The CERN world did not become ready.');
      await page.waitForTimeout(1000);
    }
    const record = await page.evaluate(async (id) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { CERN_SITE_REFERENCE } = await import('/app/js/interiors/cern-site-reference.js'),
        { resolveCernInterior } = await import('/app/js/interiors/cern-content.js'),
        site = CERN_SITE_REFERENCE.find((s) => s.id === id),
        identities = [site.sourceBuildingId, ...(site.sourceAliases || [])],
        building = ctx.buildings.find((b) => identities.includes(b.sourceBuildingId)),
        support =
          building && ctx.resolveBuildingEntrySupport?.(building, { allowSynthetic: false }),
        resolved = support && resolveCernInterior(ctx, support, { mode: 'generated' });
      const origin = ctx.geoToWorld(site.footprint[0].lat, site.footprint[0].lon),
        nearby = ctx.buildings
          .filter(
            (b) =>
              Math.hypot(b.centerX - origin.x, b.centerZ - origin.z) *
                (ctx.METERS_PER_WORLD_UNIT || 1.11) <
              180
          )
          .map((b) => ({
            id: b.sourceBuildingId,
            name: b.name,
            kind: b.buildingType,
            part: b.buildingPartKind,
            center: { x: b.centerX, z: b.centerZ },
            pts: b.pts,
            provenance: b.buildingProvenance,
          }));
      return {
        id,
        nearby,
        location: { lat: ctx.LOC.lat, lon: ctx.LOC.lon },
        scale: ctx.SCALE,
        unit: ctx.METERS_PER_WORLD_UNIT,
        buildings: ctx.buildings.length,
        building: building
          ? {
              id: building.sourceBuildingId,
              name: building.name,
              pts: building.pts,
              height: building.height,
              baseY: building.baseY,
              provenance: building.buildingProvenance,
            }
          : null,
        support: support
          ? {
              key: support.key,
              enterable: support.enterable,
              label: support.label,
              entryAnchor: support.entryAnchor,
              exteriorEntrance: support.exteriorEntrance,
              reason: support.reason,
            }
          : null,
        content: resolved?.cernContent || null,
        association: resolved?.contentAssociation || null,
      };
    }, site.id);
    report.sites.push(record);
    if (process.env.WE3D_CERN_DIAGNOSE === '1') {
      report.scope =
        'Read-only diagnosis of missing CERN reference identity in the loaded world; not admission/traversal or career completion.';
      break;
    }
    console.log(
      JSON.stringify({
        id: site.id,
        buildings: record.buildings,
        sourceBuildingId: record.building?.id,
        enterable: record.support?.enterable,
        content: record.content,
      })
    );
    assert.equal(
      record.content?.siteId,
      site.id,
      'Existing mapped identity/footprint/entry support must admit the intended CERN facility.'
    );
    await page.screenshot({ path: output + '/' + site.id + '.png' });
  }
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
