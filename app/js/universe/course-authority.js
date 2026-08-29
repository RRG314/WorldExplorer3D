import { getUniverseFrame, resolveUniverseAddress } from './catalog.js?v=10';

const UNIVERSE_GUIDANCE_MODE = Object.freeze({
  MANUAL: 'manual',
  ASSISTED: 'assisted'
});

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
    guidance: UNIVERSE_GUIDANCE_MODE.MANUAL,
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

function setUniverseCourseGuidance(course, guidance) {
  if (!course || !Object.values(UNIVERSE_GUIDANCE_MODE).includes(guidance)) return course || null;
  return Object.freeze({ ...course, guidance });
}

export {
  courseTargetsFrame,
  createUniverseCourse,
  setUniverseCourseGuidance,
  setUniverseCourseStatus,
  UNIVERSE_GUIDANCE_MODE
};
