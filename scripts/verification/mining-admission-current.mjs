import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = 'output/verification/mining-career-20261103/admission-' + Date.now(),
  qa = await createFieldworkQaSession({ output, careerId: 'mining', maximumDurationMs: 210000 }),
  { page, report } = qa;
try {
  report.scope =
    'Only new curated fictional exhibit reference in the actual loaded Earth world, ground/collision/footprint and mapped-exclusion admission. Disposable blank profile; no Mining job, source procedure, physical excavation or real property authorization claim.';
  await page.goto(
    'http://127.0.0.1:4192/app/?lat=39.27&lon=-76.59&name=Quarry%20training%20yard&diagnostics=1'
  );
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.quarryAdmissionReady = () =>
      ctx.gameStarted &&
      !ctx.worldLoading &&
      !!ctx.worldPublication?.requestId &&
      !document.querySelector('#loading')?.classList.contains('show');
  });
  await page.waitForFunction(() => quarryAdmissionReady(), {}, { timeout: 180000 });
  report.admission = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { qualifyResearchSite } = await import('/app/js/campaign/research-site.js'),
      { MINING_OFFSETS } = await import('/app/js/campaign/mining-formation.js'),
      { miningSiteEligibility } = await import('/app/js/campaign/mining-presentation.js'),
      { MINING_YARD, miningSiteDescriptor, miningYardAdmission } = await import(
        '/app/js/campaign/mining-places.js'
      );
    const qualified = qualifyResearchSite(ctx, {
        ...miningSiteDescriptor(MINING_YARD),
        offsets: MINING_OFFSETS,
        eligibility: miningSiteEligibility,
      }),
      permit = miningYardAdmission(ctx, qualified);
    return {
      permit,
      site: qualified.site,
      points: qualified.points,
      unit: qualified.metersPerUnit,
      landuses: (ctx.landuses || []).map((f) => ({
        type: f.type,
        kind: f.kind,
        landuse: f.tags?.landuse,
        leisure: f.tags?.leisure,
      })),
      hasPolygonOwner: typeof ctx.pointInPolygon === 'function',
    };
  });
  assert.equal(report.admission.permit.yardId, 'quarry-exhibit-01');
  assert.equal(report.admission.hasPolygonOwner, true);
  await page.screenshot({ path: output + '/admitted-reference.png' });
  await fs.writeFile(
    output + '/admitted-site.json',
    JSON.stringify(report.admission, null, 2) + '\n'
  );
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
