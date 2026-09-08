'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { registrationReport, validateRegistrationReport, unavailable } = require('../functions/reality-capture-diagnostics');
const { readRegistrationReport } = require('../scripts/reality-capture/reconstruction-providers.cjs');
const ids = ['a', 'b', 'c'].map(c => c.repeat(32));
const names = ids.map(id => `${id}.jpg`);
// AliceVision cameras.sfm schema fixture, not actual reconstruction evidence.
const pose = id => ({ poseId: String(id), pose: { transform: { rotation: ['1','0','0','0','1','0','0','0','1'], center: ['0','1','2'] } } });
const fixture = () => ({ views: names.map((name, i) => ({ viewId: String(i), poseId: String(i), intrinsicId: '0', path: `/private/source/${name}` })),
  poses: [pose(0), pose(2)], intrinsics: [{ intrinsicId: '0' }] });
test('counts only views with both solved poses and intrinsics; identifies unmatched input', () => {
  const report = registrationReport(fixture(), names);
  assert.equal(report.submittedCount, 3); assert.equal(report.registeredCount, 2);
  assert.deepEqual(report.unregisteredPhotoIds, [ids[1]]);
  assert.equal(report.coverage, 'unverified');
  assert.equal(JSON.stringify(report).includes('/private/'), false);
  assert.deepEqual(validateRegistrationReport(report, names), report);
});
test('all cameras registered still does not certify building surface coverage', () => {
  const sfm = fixture(); sfm.poses.push(pose(1));
  const report = registrationReport(sfm, names);
  assert.equal(report.registeredCount, 3);
  assert.equal(report.reason, 'registration_is_not_surface_coverage');
  assert.equal(report.coverage, 'unverified');
});
test('missing views/intrinsics are not counted as registered', () => {
  const sfm = fixture(); sfm.views.pop(); sfm.views[0].intrinsicId = '99';
  assert.equal(registrationReport(sfm, names).registeredCount, 0);
});
test('rejects duplicate, foreign, corrupt and non-finite camera evidence', () => {
  for (const mutate of [s => s.views.push(s.views[0]), s => {s.views[0].path = 'd'.repeat(32)+'.jpg';},
    s => {s.poses[0].pose.transform.center[0] = 'NaN';}, s => {delete s.poses[0].poseId;},
    s => s.poses.push(s.poses[0])]) {
    const sfm = fixture(); mutate(sfm); assert.throws(() => registrationReport(sfm, names));
  }
  assert.throws(() => registrationReport(fixture(), [names[0], names[0]]));
});
test('broker rejects forged counts, coverage certification and unowned photo identities', () => {
  const good = registrationReport(fixture(), names);
  for (const patch of [{submittedCount: 21}, {registeredCount: 3}, {registeredCount: -1}, {coverage: 'complete'},
    {unregisteredPhotoIds: ['d'.repeat(32)]}, {unregisteredPhotoIds: [ids[1],ids[1]]}]) {
    assert.throws(() => validateRegistrationReport({...good,...patch}, names));
  }
  assert.deepEqual(validateRegistrationReport({...good, secret: 'not retained'}, names), good);
  assert.equal(validateRegistrationReport(null,names).registeredCount, null);
  assert.throws(() => validateRegistrationReport({...unavailable(names),registeredCount:3}, names));
});
test('reads actual temporary files; missing, malformed and ambiguous outputs never become a passing report', async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(),'we3d-diagnostics-'));
  try {
    const job = {images:path.join(work,'images'),cache:path.join(work,'cache')};
    await fs.mkdir(job.images); await fs.mkdir(job.cache);
    for (const name of names) await fs.writeFile(path.join(job.images,name),'fixture');
    assert.equal((await readRegistrationReport(job)).reason,'missing_camera_report');
    const root = path.join(job.cache,'StructureFromMotion','one'); await fs.mkdir(root,{recursive:true});
    await fs.writeFile(path.join(root,'cameras.sfm'),JSON.stringify(fixture()));
    assert.equal((await readRegistrationReport(job)).registeredCount,2);
    await fs.writeFile(path.join(root,'cameras.sfm'),'{broken');
    assert.equal((await readRegistrationReport(job)).reason,'invalid_camera_report');
    const other = path.join(job.cache,'StructureFromMotion','two'); await fs.mkdir(other);
    await fs.writeFile(path.join(other,'cameras.sfm'),'{}');
    assert.equal((await readRegistrationReport(job)).reason,'ambiguous_camera_report');
  } finally { await fs.rm(work,{recursive:true,force:true}); }
});
