import assert from 'node:assert/strict';
import { resolveBuildingPublicationSelection } from '../app/js/world/load-building-detail.js';

const desktopDense = resolveBuildingPublicationSelection({
  maxBuildingWays: 26000,
  requestedBuildingWays: 24000,
  tileBudgetCfg: {
    buildingsPerTile: 460,
    buildingsMinPerTile: 130
  },
  useRdtBudgeting: true
});

assert.equal(desktopDense.globalCap, 20400, 'dense locations must target 85% mapped building retention');
assert.equal(desktopDense.coverageTarget, 0.85, 'the requested building coverage target must remain explicit');
assert.equal(desktopDense.basePerTile, 1200, 'dense tiles must retain complete footprint coverage');
assert.equal(desktopDense.useRdt, false, 'recursive-depth thinning must not punch holes in building coverage');
assert.equal(desktopDense.coreRatio, 0.78, 'global overflow must retain broad mapped coverage around its contiguous core');

const deviceScaled = resolveBuildingPublicationSelection({
  maxBuildingWays: 7000,
  requestedBuildingWays: 10000,
  tileBudgetCfg: {
    buildingsPerTile: 220,
    buildingsMinPerTile: 120
  }
});
assert.equal(deviceScaled.globalCap, 7000, 'device-scaled global safety ceiling must remain authoritative');

const justAboveLegacyCap = resolveBuildingPublicationSelection({
  maxBuildingWays: 26000,
  requestedBuildingWays: 10000,
  tileBudgetCfg: { buildingsPerTile: 460, buildingsMinPerTile: 130 }
});
assert.equal(justAboveLegacyCap.globalCap, 9001, 'dense sources must no longer collapse to the old 9,000-building ceiling');

const safetyBoundedDense = resolveBuildingPublicationSelection({
  maxBuildingWays: 26000,
  requestedBuildingWays: 40000,
  tileBudgetCfg: { buildingsPerTile: 460, buildingsMinPerTile: 130 }
});
assert.equal(safetyBoundedDense.globalCap, 26000, 'the earlier proven safety ceiling must bound unusually large sources');

console.log(JSON.stringify({
  ok: true,
  contract: 'building-publication-coverage',
  mappedCoverageTarget: 0.85,
  recursiveTileThinningDisabled: true,
  contiguousCenterReserved: true,
  deviceScaledGlobalCapPreserved: true
}, null, 2));
