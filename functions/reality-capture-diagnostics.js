'use strict';

// Shared worker/broker contract. Never retain paths, coordinates, EXIF or URLs.
const PHOTO = /^[a-f0-9]{32}$/;
function cameraId(value) {
  const id = String(value);
  if (!/^\d{1,20}$/.test(id)) throw Error('invalid_camera_id');
  return id;
}
function photoId(name) {
  const id = String(name || '').split(/[\\/]/).pop().replace(/\.(jpg|webp)$/i, '');
  if (!PHOTO.test(id)) throw Error('invalid_diagnostic_photo');
  return id;
}
function inputIds(names) {
  if (!Array.isArray(names) || !names.length || names.length > 48) throw Error('invalid_diagnostic_inputs');
  const ids = names.map(photoId).sort();
  if (new Set(ids).size !== ids.length) throw Error('duplicate_diagnostic_inputs');
  return ids;
}
function unavailable(names, reason = 'missing_camera_report') {
  return { schemaVersion: 1, status: 'unavailable', submittedCount: inputIds(names).length,
    registeredCount: null, unregisteredPhotoIds: [], coverage: 'unverified', reason };
}
function registrationReport(sfm, names) {
  const expected = inputIds(names);
  if (!Array.isArray(sfm?.views) || !Array.isArray(sfm?.poses) || !Array.isArray(sfm?.intrinsics) ||
      sfm.views.length > 48 || sfm.poses.length > 48 || sfm.intrinsics.length > 48) throw Error('invalid_camera_report');
  const intrinsics = new Set(sfm.intrinsics.map(x => cameraId(x.intrinsicId)));
  const poses = new Set();
  for (const p of sfm.poses) {
    const t = p.pose?.transform;
    if (!Array.isArray(t?.rotation) || t.rotation.length !== 9 || !Array.isArray(t?.center) || t.center.length !== 3 ||
      ![...t.rotation, ...t.center].every(x => (typeof x === 'number' || typeof x === 'string' && x.trim() !== '') && Number.isFinite(Number(x)))) throw Error('invalid_camera_pose');
    const id = cameraId(p.poseId);
    if (poses.has(id)) throw Error('duplicate_camera_pose');
    poses.add(id);
  }
  const views = new Map();
  const viewIds = new Set();
  for (const v of sfm.views) {
    const id = photoId(v.path);
    const viewId = cameraId(v.viewId);
    if (!expected.includes(id) || views.has(id) || viewIds.has(viewId)) throw Error('camera_input_mismatch');
    viewIds.add(viewId);
    views.set(id, poses.has(String(v.poseId)) && intrinsics.has(String(v.intrinsicId)));
  }
  const unregisteredPhotoIds = expected.filter(id => views.get(id) !== true);
  return { schemaVersion: 1, status: 'available', submittedCount: expected.length,
    registeredCount: expected.length - unregisteredPhotoIds.length, unregisteredPhotoIds,
    coverage: 'unverified', reason: unregisteredPhotoIds.length ? 'some_photos_unregistered' : 'registration_is_not_surface_coverage' };
}
function validateRegistrationReport(report, names) {
  const ids = inputIds(names);
  if (!report) return unavailable(names);
  if (report.schemaVersion !== 1 || report.submittedCount !== ids.length || report.coverage !== 'unverified') throw Error('invalid_registration_summary');
  if (report.status === 'unavailable') {
    if (!['missing_camera_report', 'invalid_camera_report', 'ambiguous_camera_report'].includes(report.reason) ||
        report.registeredCount !== null || !Array.isArray(report.unregisteredPhotoIds) || report.unregisteredPhotoIds.length) throw Error('invalid_registration_summary');
    return unavailable(names, report.reason);
  }
  const missing = report.unregisteredPhotoIds;
  if (report.status !== 'available' || !Number.isInteger(report.registeredCount) || report.registeredCount < 0 ||
      !Array.isArray(missing) || missing.length > 48 || new Set(missing).size !== missing.length ||
      missing.some(id => !ids.includes(id)) || report.registeredCount + missing.length !== ids.length) throw Error('invalid_registration_summary');
  return { schemaVersion: 1, status: 'available', submittedCount: ids.length, registeredCount: report.registeredCount,
    unregisteredPhotoIds: [...missing].sort(), coverage: 'unverified',
    reason: missing.length ? 'some_photos_unregistered' : 'registration_is_not_surface_coverage' };
}
module.exports = { registrationReport, validateRegistrationReport, unavailable };
