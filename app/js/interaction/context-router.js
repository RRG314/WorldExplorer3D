import { ctx as appCtx } from '../shared-context.js?v=55';

const handlers = new Map();

function normalizeCandidate(handler, candidate) {
  if (!candidate || candidate.available === false) return null;
  return Object.freeze({
    id: handler.id,
    priority: handler.priority,
    available: true,
    action: String(candidate.action || handler.id),
    label: String(candidate.label || 'Interact'),
    detail: String(candidate.detail || ''),
    distance: Number.isFinite(candidate.distance) ? candidate.distance : null,
    secondaryLabel: candidate.secondaryLabel ? String(candidate.secondaryLabel) : '',
    takeLabel: candidate.takeLabel ? String(candidate.takeLabel) : '',
    data: candidate.data || null
  });
}

function resolvePrimaryContextInteraction() {
  const candidates = [];
  for (const handler of handlers.values()) {
    try {
      const candidate = normalizeCandidate(handler, handler.evaluate?.());
      if (candidate) candidates.push(candidate);
    } catch (error) {
      console.warn(`[interaction] ${handler.id} evaluation failed.`, error);
    }
  }
  candidates.sort((a, b) => {
    const priorityGap = Math.abs(b.priority - a.priority);
    if (priorityGap > 5) return b.priority - a.priority;
    if (a.distance !== null && b.distance !== null && Math.abs(a.distance - b.distance) > .08) {
      return a.distance - b.distance;
    }
    return b.priority - a.priority;
  });
  return candidates[0] || null;
}

async function handlePrimaryContextInteraction() {
  const candidate = resolvePrimaryContextInteraction();
  if (!candidate) return false;
  const handler = handlers.get(candidate.id);
  if (!handler?.perform) return false;
  try {
    const result = await handler.perform(candidate);
    return result !== false;
  } catch (error) {
    console.warn(`[interaction] ${candidate.id} action failed.`, error);
    return false;
  }
}

function registerContextInteraction(definition = {}) {
  const id = String(definition.id || '').trim();
  if (!id) throw new Error('Context interaction requires an id.');
  if (typeof definition.evaluate !== 'function' || typeof definition.perform !== 'function') {
    throw new Error(`Context interaction ${id} requires evaluate and perform functions.`);
  }
  const record = Object.freeze({
    id,
    priority: Number.isFinite(definition.priority) ? definition.priority : 0,
    evaluate: definition.evaluate,
    perform: definition.perform
  });
  handlers.set(id, record);
  return () => {
    if (handlers.get(id) === record) handlers.delete(id);
  };
}

function contextInteractionSnapshot() {
  const active = resolvePrimaryContextInteraction();
  return Object.freeze({
    registered: handlers.size,
    active
  });
}

Object.assign(appCtx, {
  contextInteractionSnapshot,
  handlePrimaryContextInteraction,
  registerContextInteraction,
  resolvePrimaryContextInteraction
});

export {
  contextInteractionSnapshot,
  handlePrimaryContextInteraction,
  registerContextInteraction,
  resolvePrimaryContextInteraction
};
