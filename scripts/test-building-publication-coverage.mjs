import assert from 'node:assert/strict';
import { resolveBuildingPublicationSelection } from '../app/js/world/load-building-detail.js';

const desktopDense = resolveBuildingPublicationSelection({
  maxBuildingWays: 26000,
  tileBudgetCfg: {
    buildingsPerTile: 460,
    buildingsMinPerTile: 130
  },
  useRdtBudgeting: true
});

assert.equal(desktopDense.globalCap, 26000, 'desktop publication must not be truncated at the legacy 12k ceiling');
assert.equal(desktopDense.basePerTile, 1200, 'dense tiles must retain complete footprint coverage');
assert.equal(desktopDense.useRdt, false, 'recursive-depth thinning must not punch holes in building coverage');
assert.ok(desktopDense.coreRatio >= 0.75, 'global overflow must preserve a contiguous central district');

const deviceScaled = resolveBuildingPublicationSelection({
  maxBuildingWays: 7000,
  tileBudgetCfg: {
    buildingsPerTile: 220,
    buildingsMinPerTile: 120
  }
});
assert.equal(deviceScaled.globalCap, 7000, 'device-scaled global safety ceiling must remain authoritative');

console.log(JSON.stringify({
  ok: true,
  contract: 'building-publication-coverage',
  legacyTwelveThousandCapRemoved: true,
  recursiveTileThinningDisabled: true,
  contiguousCenterReserved: true,
  deviceScaledGlobalCapPreserved: true
}, null, 2));
