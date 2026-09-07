import { constructOutpost, createOutpostSite, serviceOutpost } from './outpost.js?v=1';
import { DEFAULT_CREW, getPropulsionProfile, getShipProfile } from './catalog.js?v=2';
import { createExpeditionPlan } from './model.js?v=12';
import { applyShipOperation } from './ship-operations.js?v=7';
import { advanceToNextMilestone, resolveExpeditionEvent, startExpedition } from './simulation.js?v=9';
import { completePirateAftermath, resolvePirateInterception, transitionPirateInterception } from './hostile-interception.js?v=1';

const COMMAND_TYPES = Object.freeze([
  'start',
  'advance',
  'event-response',
  'ship-operation',
  'outpost-plan',
  'outpost-build',
  'outpost-service',
  'encounter-transition',
  'encounter-resolve',
  'encounter-complete'
]);

function cleanText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeExpeditionCommand(input = {}) {
  const type = cleanText(input.type, 40).toLowerCase();
  if (!COMMAND_TYPES.includes(type)) throw new Error('invalid_expedition_command');
  return Object.freeze({
    type,
    choiceId: cleanText(input.choiceId, 120),
    operationId: cleanText(input.operationId, 120),
    contactId: cleanText(input.contactId, 180),
    outpostId: cleanText(input.outpostId, 220),
    encounterEvent: cleanText(input.encounterEvent, 80),
    encounterResult: input.encounterResult && typeof input.encounterResult === 'object'
      ? Object.freeze({ ...input.encounterResult })
      : null
  });
}

function createAuthorizedExpeditionPlan(input = {}, options = {}) {
  const destinationId = cleanText(input.destinationId, 160).toLowerCase();
  const shipId = cleanText(input.shipId, 80).toLowerCase();
  const propulsionId = cleanText(input.propulsionId, 80).toLowerCase();
  const realism = cleanText(input.realism, 40).toLowerCase();
  const survival = cleanText(input.survival, 40).toLowerCase();
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  if (!destinationId || !getShipProfile(shipId) || !getPropulsionProfile(propulsionId)) {
    throw new Error('invalid_expedition_configuration');
  }
  if (!['science-inspired', 'custom'].includes(realism) || !['forgiving', 'severe'].includes(survival)) {
    throw new Error('invalid_expedition_configuration');
  }
  return createExpeditionPlan({
    destinationId,
    shipId,
    propulsionId,
    realism,
    survival,
    crew: DEFAULT_CREW,
    createdAtMs: nowMs,
    id: `expedition-${nowMs}`
  });
}

function executeExpeditionCommand(expedition, input = {}, options = {}) {
  if (!expedition || expedition.type !== 'InterstellarExpedition') {
    throw new Error('invalid_expedition_plan');
  }
  const command = normalizeExpeditionCommand(input);
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  let result = null;
  if (command.type === 'start') {
    result = { expedition: startExpedition(expedition, nowMs), message: 'The Expedition departed.' };
  } else if (command.type === 'advance') {
    result = { expedition: advanceToNextMilestone(expedition), message: 'The next voyage chapter is ready.' };
  } else if (command.type === 'event-response') {
    result = { expedition: resolveExpeditionEvent(expedition, command.choiceId), message: 'The crew completed the response.' };
  } else if (command.type === 'ship-operation') {
    result = applyShipOperation(expedition, command.operationId);
  } else if (command.type === 'outpost-plan') {
    result = createOutpostSite(expedition, command.contactId, nowMs);
  } else if (command.type === 'outpost-build') {
    result = constructOutpost(expedition, command.outpostId, nowMs);
  } else if (command.type === 'outpost-service') {
    result = serviceOutpost(expedition, command.outpostId, nowMs);
  } else if (command.type === 'encounter-transition') {
    result = { expedition: transitionPirateInterception(expedition, command.encounterEvent), message: 'Hostile interception advanced.' };
  } else if (command.type === 'encounter-resolve') {
    result = { expedition: resolvePirateInterception(expedition, command.encounterResult), message: 'Hostile interception resolved.' };
  } else if (command.type === 'encounter-complete') {
    result = { expedition: completePirateAftermath(expedition), message: 'The Expedition resumed course.' };
  }
  const next = result?.expedition;
  if (!next || next === expedition || result?.changed === false) {
    throw new Error('expedition_command_not_available');
  }
  return Object.freeze({
    command,
    expedition: next,
    message: cleanText(result?.message || 'The Expedition was updated.', 240)
  });
}

export { COMMAND_TYPES, createAuthorizedExpeditionPlan, executeExpeditionCommand, normalizeExpeditionCommand };
