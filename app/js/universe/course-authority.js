import { getUniverseFrame, resolveUniverseAddress } from './catalog.js?v=10';

function createUniverseCourse(destinationOrId, currentFrameId, setAt = 0) {
  const destination = typeof destinationOrId === 'string'
    ? resolveUniverseAddress(destinationOrId)
    : destinationOrId;
  const frame = getUniverseFrame(destination);
  if (!destination || !frame) return null;
  return Object.freeze({
    destination,
    frame,
    status: frame.id === currentFrameId ? 'active' : 'transit',
    setAt: Number(setAt) || 0
  });
}

function setUniverseCourseStatus(course, status) {
  if (!course || !['transit', 'active'].includes(status)) return course || null;
  return Object.freeze({ ...course, status });
}

function courseTargetsFrame(course, frameId) {
  return Boolean(course?.frame?.id && course.frame.id === frameId);
}

export { courseTargetsFrame, createUniverseCourse, setUniverseCourseStatus };
