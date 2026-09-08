'use strict';
// Local-only: no cloud SDK, credentials, dispatch, upload or reconstruction call.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { registrationReport, validateRegistrationReport } = require('./registration-diagnostics.cjs');
const id = 'a'.repeat(32);
const diagnostic = registrationReport({ views: [{ viewId: '1', poseId: '1', intrinsicId: '0', path: `${id}.jpg` }],
  poses: [], intrinsics: [{intrinsicId: '0'}] }, [`${id}.jpg`]);
validateRegistrationReport(diagnostic, [`${id}.jpg`]);
const blender = spawnSync(process.env.BLENDER_BIN || 'blender', ['--version'], { encoding: 'utf8', timeout: 10000 });
const meshroom = spawnSync(process.env.MESHROOM_BATCH_BIN || 'meshroom_batch', ['--help'], { encoding: 'utf8', timeout: 10000 });
const report = { cloudCalls: 0, reconstructionStarted: false, diagnosticContract: 'passed',
  blenderAvailable: !blender.error && blender.status === 0,
  meshroomCliAvailable: !meshroom.error && meshroom.status === 0,
  installedTexturedExport: 'not_run', realBuildingAcceptance: false };
if (report.blenderAvailable) {
  const result = spawnSync(process.execPath, [path.join(__dirname,'blender-export-selftest.cjs')], { stdio: 'inherit', timeout: 150000 });
  report.installedTexturedExport = !result.error && result.status === 0 ? 'passed' : 'failed';
}
report.readyForSameToolchainValidation = report.meshroomCliAvailable && report.installedTexturedExport === 'passed';
console.log(JSON.stringify(report,null,2));
if (!report.readyForSameToolchainValidation) process.exitCode = 2;
