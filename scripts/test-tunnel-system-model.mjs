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
assert.equal(tunnelModel.version, 6);
assert.equal(tunnelModel.portalZones.length, 2);
assert.ok(tunnelModel.portalZones.every((zone) => zone.transitionLength <= 11));
assert.ok(tunnelModel.portalZones[0].approachStart > 0, 'entrance transition must be local to the cover boundary');
assert.ok(tunnelModel.portalZones[1].approachEnd < 100, 'exit transition must be local to the cover boundary');

const splitCoverTunnel = tunnelFeature(0, 120, 'Split Cover Tunnel');
splitCoverTunnel.connectedFeatures.start.push({ feature: surfaceStart });
splitCoverTunnel.connectedFeatures.end.push({ feature: surfaceEnd });
const splitCoverModel = compileTunnelSystemModel(
  splitCoverTunnel,
  (x) => ((x >= 12 && x <= 42) || (x >= 72 && x <= 108) ? 8 : 0)
);
assert.equal(splitCoverModel.shellRanges.length, 2, 'separate hills must create separate tunnel shells');
assert.equal(splitCoverModel.portalDistances.length, 4, 'every verified terrain crossing needs a portal');
assert.ok(splitCoverModel.shellRanges[0].end < splitCoverModel.shellRanges[1].start);
assert.equal(splitCoverModel.portalZones.length, 4);

const exposedProfileTunnel = tunnelFeature(0, 100, 'Exposed Approach Tunnel');
exposedProfileTunnel.connectedFeatures.start.push({ feature: surfaceStart });
exposedProfileTunnel.connectedFeatures.end.push({ feature: surfaceEnd });
compileTunnelSystemModels([exposedProfileTunnel], coveredTerrain);
assert.ok(
  Math.abs(exposedProfileTunnel.transportSurfaceModel.centerHeights[0] - 0.08) < 0.001,
  'road beyond the excavated tunnel approach must return to terrain'
);

const shortUnderpass = tunnelFeature(0, 32, 'Short Underpass');
const underpassModel = compileTunnelSystemModel(shortUnderpass, () => 0);
assert.equal(underpassModel.visualKind, 'underpass');
assert.equal(underpassModel.shellStart, null);
assert.equal(underpassModel.portalStart, null);

const chainA = tunnelFeature(0, 50, 'Continuous Tunnel');
const chainB = tunnelFeature(50, 100, 'Changed Route Name');
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
    end: Number(tunnelModel.shellEnd.toFixed(2)),
    transitionZones: tunnelModel.portalZones.length
  },
  shortUnderpass: underpassModel.visualKind,
  continuousChain: true,
  semanticClasses: ['tunnel', 'underpass', 'building_passage', 'culvert']
}, null, 2));
