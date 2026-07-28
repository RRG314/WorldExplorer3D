import assert from 'node:assert/strict';
import { classifyStructureSemantics } from '../app/js/structure-semantics/classification.js';
import {
  compileTunnelSystemModel,
  compileTunnelSystemModels
} from '../app/js/world/compiler/tunnel-system-model.js';

function constantProfile(length, y = 0) {
  return {
    width: 8,
    pathDistances: new Float32Array([0, length]),
    distances: new Float32Array([0, length]),
    centerHeights: new Float32Array([y, y]),
    leftHeights: new Float32Array([y, y]),
    rightHeights: new Float32Array([y, y])
  };
}

function tunnelFeature(x1, x2, name = 'Test Tunnel') {
  const length = Math.abs(x2 - x1);
  return {
    name,
    width: 8,
    pts: [{ x: x1, z: 0 }, { x: x2, z: 0 }],
    transportSurfaceModel: constantProfile(length),
    structureSemantics: classifyStructureSemantics(
      { tunnel: 'yes', layer: '-1' },
      { featureKind: 'road', subtype: 'primary' }
    ),
    connectedFeatures: { start: [], end: [] }
  };
}

const surfaceStart = { structureSemantics: classifyStructureSemantics({}, { featureKind: 'road', subtype: 'primary' }) };
const surfaceEnd = { structureSemantics: classifyStructureSemantics({}, { featureKind: 'road', subtype: 'primary' }) };
const tunnel = tunnelFeature(0, 100);
tunnel.connectedFeatures.start.push({ feature: surfaceStart });
tunnel.connectedFeatures.end.push({ feature: surfaceEnd });
const coveredTerrain = (x) => (x >= 18 && x <= 82 ? 7 : 0);
const tunnelModel = compileTunnelSystemModel(tunnel, coveredTerrain);
assert.equal(tunnelModel.visualKind, 'tunnel');
assert.ok(tunnelModel.shellStart >= 14 && tunnelModel.shellStart <= 22);
assert.ok(tunnelModel.shellEnd >= 78 && tunnelModel.shellEnd <= 86);
assert.equal(tunnelModel.portalStart, tunnelModel.shellStart);
assert.equal(tunnelModel.portalEnd, tunnelModel.shellEnd);

const shortUnderpass = tunnelFeature(0, 32, 'Short Underpass');
const underpassModel = compileTunnelSystemModel(shortUnderpass, () => 0);
assert.equal(underpassModel.visualKind, 'underpass');
assert.equal(underpassModel.shellStart, null);
assert.equal(underpassModel.portalStart, null);

const chainA = tunnelFeature(0, 50, 'Continuous Tunnel');
const chainB = tunnelFeature(50, 100, 'Continuous Tunnel');
chainA.connectedFeatures.start.push({ feature: surfaceStart });
chainA.connectedFeatures.end.push({ feature: chainB });
chainB.connectedFeatures.start.push({ feature: chainA });
chainB.connectedFeatures.end.push({ feature: surfaceEnd });
compileTunnelSystemModels([chainA, chainB], () => 8);
assert.equal(chainA.tunnelSystemModel.shellEnd, 50);
assert.equal(chainA.tunnelSystemModel.portalEnd, null);
assert.equal(chainB.tunnelSystemModel.shellStart, 0);
assert.equal(chainB.tunnelSystemModel.portalStart, null);

const buildingPassage = classifyStructureSemantics(
  { tunnel: 'building_passage', covered: 'yes' },
  { featureKind: 'road', subtype: 'service' }
);
assert.equal(buildingPassage.structureKind, 'covered');
assert.equal(buildingPassage.terrainMode, 'at_grade');
assert.equal(buildingPassage.isTunnel, false);

const culvert = classifyStructureSemantics(
  { tunnel: 'culvert', layer: '-1' },
  { featureKind: 'road', subtype: 'service' }
);
assert.equal(culvert.structureKind, 'culvert');
assert.equal(compileTunnelSystemModel({
  ...shortUnderpass,
  structureSemantics: culvert
}, () => 8), null);

console.log(JSON.stringify({
  ok: true,
  portalModel: {
    start: Number(tunnelModel.shellStart.toFixed(2)),
    end: Number(tunnelModel.shellEnd.toFixed(2))
  },
  shortUnderpass: underpassModel.visualKind,
  continuousChain: true,
  semanticClasses: ['tunnel', 'underpass', 'building_passage', 'culvert']
}, null, 2));
