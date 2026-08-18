import { ctx as appCtx } from '../shared-context.js?v=55';

const handlers = new Map();

function normalizeCandidate(handler, candidate) {
  if (!candidate || candidate.available === false) return null;
  return Object.freeze({
    id: handler.id,
    priority: handler.priority,
    action: String(candidate.action || handler.id),
    label: String(candidate.label || 'Interact'),
    detail: String(candidate.detail || ''),
    distance: Number.isFinite(candidate.distance) ? candidate.distance : null,
    data: candidate.data || null
  });
}

function resolvePrimaryContextInteraction() {
  const ordered = [...handlers.values()].sort((a, b) => b.priority - a.priority);
  for (const handler of ordered) {
    try {
      const candidate = normalizeCandidate(handler, handler.evaluate?.());
      if (candidate) return candidate;
    } catch (error) {
      console.warn(`[interaction] ${handler.id} evaluation failed.`, error);
    }
  }
  return null;
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
