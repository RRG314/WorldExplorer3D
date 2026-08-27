import { TOOL_CATALOG } from './catalog.js?v=2';

const DEPTH_BANDS = Object.freeze(['surface', 'shallow', 'moderate', 'deep', 'heavy']);

function createExplorationEntitlementService(options = {}) {
  const mode = String(options.mode || 'free-testing');
  const unlockedToolIds = Array.isArray(options.unlockedToolIds) ? new Set(options.unlockedToolIds.map(String)) : null;
  const visibleToolIds = Array.isArray(options.visibleToolIds) ? new Set(options.visibleToolIds.map(String)) : null;
  const visibleTools = () => TOOL_CATALOG.filter((tool) => !visibleToolIds || visibleToolIds.has(tool.id));
  return Object.freeze({
    mode,
    canUseTool(toolId) {
      const exists = TOOL_CATALOG.some((tool) => tool.id === String(toolId));
      const unlocked = !unlockedToolIds || unlockedToolIds.has(String(toolId));
      return Object.freeze({
        allowed: exists && mode === 'free-testing' && unlocked,
        reason: !exists ? 'unknown-tool' : !unlocked ? 'progression-locked' : mode === 'free-testing' ? 'free-testing' : 'not-entitled'
      });
    },
    listAvailableTools() {
      return mode === 'free-testing' ? visibleTools().filter((tool) => !unlockedToolIds || unlockedToolIds.has(tool.id)) : [];
    },
    listLockedTools() {
      return mode === 'free-testing' && unlockedToolIds ? visibleTools().filter((tool) => !unlockedToolIds.has(tool.id)) : [];
    },
    snapshot() {
      const availableToolCount = mode === 'free-testing' ? visibleTools().filter((tool) => !unlockedToolIds || unlockedToolIds.has(tool.id)).length : 0;
      return Object.freeze({ mode, purchaseUiVisible: false, availableToolCount, lockedToolCount: mode === 'free-testing' && unlockedToolIds ? visibleTools().length - availableToolCount : 0 });
    }
  });
}

function getTool(toolId) {
  return TOOL_CATALOG.find((tool) => tool.id === String(toolId)) || null;
}

function toolSupportsDepth(toolId, depthBand) {
  return !!getTool(toolId)?.depthBands.includes(String(depthBand));
}

function resolveExcavationTool(depthBand, availableToolIds = []) {
  const band = String(depthBand);
  if (!DEPTH_BANDS.includes(band)) return Object.freeze({ allowed: false, reason: 'unknown-depth-band', tool: null });
  const tool = availableToolIds.map(getTool).find((entry) => entry?.capabilities.includes('excavate') && entry.depthBands.includes(band));
  if (tool) return Object.freeze({ allowed: true, reason: 'capability-match', tool });
  const required = TOOL_CATALOG.filter((entry) => entry.capabilities.includes('excavate') && entry.depthBands.includes(band));
  return Object.freeze({ allowed: false, reason: required.length ? 'requires-excavation-tool' : 'depth-not-supported', tool: null, requiredToolIds: required.map((entry) => entry.id) });
}

export { DEPTH_BANDS, createExplorationEntitlementService, getTool, resolveExcavationTool, toolSupportsDepth };
