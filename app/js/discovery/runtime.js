import { BUILTIN_DISCOVERY_CATALOGS, COMPANION_CATALOG, TOOL_CATALOG, validateDiscoveryCatalogs } from './catalog.js?v=4';
import { createCompanionRuntime } from './companion-runtime.js?v=7';
import { auditRegionalCreatureQuality } from './creature-quality.js?v=1';
import { createDetectorSession } from './detector-session.js?v=3';
import { createWalkingEncounterDirector } from './encounter-director.js?v=1';
import { resolveRegionalEcologyPack } from './ecology/regional-packs.js?v=2';
import { compileEnvironmentContext } from './environment-context.js?v=2';
import { createFieldRetentionSnapshot } from './field-retention.js?v=2';
import { compileFieldActivityPlan, createFieldActivitySession } from './field-activities.js?v=3';
import { createFieldExpedition } from './field-expedition.js?v=1';
import { ACTIVITY_TOOL, createFieldEquipmentPresentation } from './field-equipment.js?v=1';
import { explorerProgressSnapshot } from './explorer-events.js?v=3';
import {
  RELEASED_EXPLORER_TOOLS,
  explorerGoalSnapshot,
  explorerToolProgress,
  regionalProgressSnapshot
} from './explorer-goals.js?v=1';
import {
  compileEncounterPlan,
  compileGeographicEligibility,
  compileWorldInteractionPublication,
  createDiscoveryPublication,
  createDiscoveryPublicationStore,
  resolveContextActions
} from './model.js?v=1';
import { createIndexedDbDiscoveryProfileStore } from './profile-store.js?v=4';
import { fieldProgress, slotAvailableAtProgress } from './pacing.js?v=2';
import { emitDiscoveryTelemetry } from './telemetry.js?v=2';
import { sampleDiscoverySurfaceY } from './surface.js?v=1';
import { createExplorationEntitlementService } from './tools.js?v=1';
import { tutorialForActivity } from './tutorials.js?v=1';
import { visualForCatalogId } from './visual-content.js?v=1';
import { compileAmbientWildlifePlan, createAmbientWildlifeRuntime } from './wildlife-runtime.js?v=4';
import { createStableWorldIdentity } from '../living-world/model.js?v=1';
import { evaluateArEligibility } from '../ar/eligibility.js?v=2';
import { getScreenLayoutService } from '../ui/screen-layout.js?v=1';
import { ATTRIBUTE_DEFINITIONS, BACKGROUND_DEFINITIONS, SPECIALTY_DEFINITIONS, SPECIALTY_RANKS, definitionById, rankForXp } from '../character/catalog.js?v=1';
import { createCapabilityResolver } from '../character/capability-resolver.js?v=2';
import { companionHandlingTuning, wildlifeObservationTuning } from '../character/wildlife-assistance.js?v=1';

const RELEASED_EXPLORER_ACTIVITIES = new Set([
  'metal-detect', 'inspect', 'photograph', 'geology-inspect', 'pan-sediment',
  'fossil-document', 'forage', 'wildlife-track', 'beachcomb', 'fish',
  'nature-observe', 'insect-macro', 'habitat-survey', 'community-survey', 'sonar-survey'
]);

const CHARACTER_CAPABILITY_BY_ACTIVITY = Object.freeze({
  'metal-detect': 'detector',
  'geology-inspect': 'geology-inspection',
  'pan-sediment': 'geology-inspection',
  'fossil-document': 'excavation'
});

function backpackEquipmentIds(appCtx, fallbackIds = []) {
  const itemIds = appCtx.playerBackpackInventory?.snapshot?.().items
    ?.filter((item) => Number(item.quantity || 1) > 0)
    .map((item) => String(item.catalogId || ''))
    .filter(Boolean) || [];
  return [...new Set([...fallbackIds.map(String), ...itemIds])];
}

const WILDLIFE_OBSERVATION_CATALOG = Object.freeze({
  'rock-pigeon': 'urban-nature-photo',
  mallard: 'wetland-waterbird-clue',
  'small-mammal': 'woodland-track-clue'
});

function fieldToolBackpackDefinition(tool) {
  return Object.freeze({
    id: tool.id,
    label: tool.label,
    category: 'field-tool',
    icon: 'TOOL',
    verbs: ['equip', 'use-context'],
    description: TOOL_FIELD_USE[tool.id] || 'Use this during a compatible field activity.',
    capabilities: tool.capabilities,
    discipline: tool.discipline,
    sourceRefs: tool.sourceRefs
  });
}

function discoveryItemBackpackRecord(item) {
  if (!item?.instanceId || !item?.catalogId) return null;
  return {
    instanceId: item.instanceId,
    catalogId: item.catalogId,
    quantity: Number(item.quantity) || 1,
    authority: item.authority || 'anonymous-local',
    provenance: item.provenance || 'field-discovery',
    sourceEventId: item.sourceEventId || item.eventId || item.claimId || '',
    acquiredAt: Number(item.collectedAt) || 0,
    tradeable: item.tradeable === true,
    metadata: {
      label: item.name || item.catalogId,
      category: 'specimen',
      icon: 'FIND',
      verbs: ['inspect'],
      description: item.description || `${item.name || item.catalogId} was added through ${displayDiscoveryLabel(item.activityId, 'an Explorer activity')}.`,
      regionLabel: item.regionLabel || '',
      evidenceClass: item.evidenceClass || ''
    }
  };
}

function projectDiscoveryItemsToBackpack(appCtx, items = []) {
  const inventory = appCtx.playerBackpackInventory;
  if (!inventory) return 0;
  let projected = 0;
  for (const item of items) {
    const record = discoveryItemBackpackRecord(item);
    if (!record) continue;
    inventory.upsertItem(record, {
      definition: {
        id: record.catalogId,
        label: record.metadata.label,
        category: record.metadata.category,
        icon: record.metadata.icon,
        verbs: record.metadata.verbs,
        description: record.metadata.description
      },
      silent: true
    });
    projected += 1;
  }
  appCtx.playerBackpackStore?.save?.(inventory.exportState?.());
  return projected;
}

const WILDLIFE_COMPANION_CATALOG = Object.freeze({
  'rock-pigeon': 'city-pigeon'
});

const FIRST_RELEASE_COMPANION_IDS = new Set([
  'trail-hound', 'field-retriever', 'park-terrier',
  'harbor-cat', 'meadow-tabby', 'midnight-cat', 'city-pigeon',
  'pasture-cow', 'wool-sheep', 'hill-goat', 'yard-chicken', 'heritage-pig', 'field-horse'
]);

const TOOL_FIELD_USE = Object.freeze({
  'field-lens': 'Inspect plants, surfaces, and close field evidence.',
  'field-camera': 'Record wildlife and habitat observations without collecting them.',
  'metal-detector': 'Locate and classify stable virtual signals in suitable ground.',
  'hand-trowel': 'Excavate surface and shallow detector finds.',
  'fishing-rod': 'Launch the full fishing activity near compatible water.',
  'field-binoculars': 'Observe and track wildlife from a respectful distance.',
  'rock-hammer': 'Inspect virtual rock and mineral survey points.',
  'sediment-pan': 'Survey virtual sediment along suitable streams and riverbanks.',
  'fossil-brush': 'Clean and document virtual fossil evidence.',
  'specimen-brush': 'Reveal delicate virtual fossil and specimen details.',
  'field-shovel': 'Excavate moderate-depth detector finds after classification.',
  'portable-sonar': 'Scan a modeled water habitat and add regional fish references to your Guide without claiming a live fish is present.'
});

const EXPLORER_SECTION_TUTORIALS = Object.freeze({
  workspace: Object.freeze({ id: 'explorer-workspace-v1', title: 'Your Explorer loop', steps: Object.freeze([
    'Choose an activity in Today. The first option is the best fit for this place; the next two are alternatives.',
    'Begin, then return to the world so your tool and the nearby clues can guide you.',
    'Finish the activity to add a memory to your Journal. Identifications also update the Guide, and objects you keep enter your Pack.',
    'Open My Explorer when you want to see your rank, specialties, and companions.'
  ]) }),
  journal: Object.freeze({ id: 'explorer-journal-v1', title: 'Journal', steps: Object.freeze([
    'The Journal is the shared story of your fieldwork, games, creations, travel, rooms, and companions.',
    'Filter by Explorer path or place when you want to find a particular memory.',
    'A saved location can return you to that place. Guide entries and Backpack items stay in their own sections.'
  ]) }),
  guide: Object.freeze({ id: 'explorer-guide-v1', title: 'Field Guide', steps: Object.freeze([
    'The Field Guide shows regional reference groups and what you have identified; it is not an inventory.',
    'Unidentified groups show how much is left and which field methods can help. Search and category filters narrow the Guide.',
    'Reference photographs help identification but do not claim the subject exists at an exact real-world point.'
  ]) }),
  profile: Object.freeze({ id: 'my-explorer-profile-v1', title: 'My Explorer', steps: Object.freeze([
    'This is your identity: Explorer rank, developing specialties, and the companions you have met.',
    'Detailed progress stays grouped here instead of competing with the activities you can do today.',
    'Wild species belong in the Field Guide. Individual animals you befriend belong with your Explorer profile.'
  ]) })
});

function playerPosition(appCtx) {
  if (appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk.state.walker) return appCtx.Walk.state.walker;
  if (appCtx.boatMode?.active) return appCtx.boat;
  if (appCtx.droneMode) return appCtx.drone;
  return appCtx.car || { x: 0, y: 0, z: 0, angle: 0 };
}

function displayDiscoveryLabel(value, fallback = 'Discovery') {
  const key = String(value || '').trim().toLowerCase();
  const labels = {
    [['procedural', 'game', 'encounter'].join('-')]: 'Guided field lead',
    'guided-field-lead': 'Guided field lead',
    'guided-exploration-lead': 'Expedition lead',
    'guided-wildlife-encounter': 'Wildlife encounter',
    'virtual-field-record': 'Field record',
    'domestic-companion': 'Domestic companion',
    'virtual-wildlife-companion': 'Wildlife companion',
    'game-wildlife-companion': 'Wildlife companion',
    'wildlife-clue': 'Wildlife sign',
    'wildlife-record': 'Wildlife observation',
    'botany-record': 'Plant observation',
    'fossil-representation': 'Fossil study',
    'fictional-find': 'Expedition find',
    'fictional-history': 'Expedition history',
    'exploration-record': 'Field note',
    'creation-record': 'Stewardship record',
    'service-record': 'Survey record',
    'not-tradeable': 'Personal record',
    'place-visited': 'Place visit',
    'activity-completed': 'Game completed',
    'world-edited': 'World edit',
    'building-milestone': 'Blocks milestone',
    'creation-saved': 'Creation saved',
    'creation-submitted': 'Creation shared',
    'room-joined': 'Room joined',
    'companion-activate': 'Companion selected',
    'companion-feed': 'Companion care',
    'companion-train': 'Companion training'
  };
  if (labels[key]) return labels[key];
  const spaced = key.replaceAll('-', ' ').replaceAll('_', ' ').replace(/\s+/g, ' ').trim();
  if (!spaced) return fallback;
  return spaced.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactCompassDirection(value) {
  const bearing = ((Number(value) % 360) + 360) % 360;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(bearing / 45) % 8];
}

function discoveryCatalogEntry(catalogId) {
  return [...BUILTIN_DISCOVERY_CATALOGS.finds, ...BUILTIN_DISCOVERY_CATALOGS.fieldDiscoveries, ...COMPANION_CATALOG]
    .find((entry) => entry.id === catalogId);
}

function guideCategoryFor(record = {}) {
  const family = String(record.family || discoveryCatalogEntry(record.catalogId)?.family || '').toLowerCase();
  if (/wildlife|animal|bird|fish|marine/.test(family)) return family.includes('marine') || family === 'fish' ? 'ocean' : 'wildlife';
  if (/botany|plant|fung/.test(family)) return 'plants';
  if (/fossil/.test(family)) return 'fossils';
  if (/rock|mineral|sediment|gem|ore|metal/.test(family)) return 'geology';
  if (/water-survey|ocean/.test(family)) return 'ocean';
  return 'places';
}

function createDiscoveryUi(state) {
  const byId = (id) => document.getElementById(id);
  const elements = {
    panel: byId('discoveryPanel'), close: byId('discoveryCloseBtn'), help: byId('discoveryHelpBtn'), quick: byId('discoveryQuickToolBtn'), menu: byId('fWorldDiscovery'),
    todayBackpack: byId('discoveryOpenBackpackTodayBtn'),
    title: byId('discoveryPanelTitle'), actions: byId('discoveryActionList'), quickLabel: byId('discoveryQuickToolBtn')?.querySelector('strong'),
    quickSignal: byId('discoveryQuickSignal'), prompt: byId('discoveryContextPrompt'), promptText: byId('discoveryContextText'),
    promptOpen: byId('discoveryContextOpenBtn'), phase: byId('discoveryPhase'), bearing: byId('discoveryBearing'),
    fill: byId('discoverySignalFill'), distance: byId('discoveryDistance'), classification: byId('discoveryClassification'),
    message: byId('discoveryMessage'), characterAssist: byId('discoveryCharacterAssist'), primary: byId('discoveryPrimaryBtn'), secondary: byId('discoverySecondaryBtn'),
    journal: byId('discoveryJournalList'), journalCategory: byId('discoveryJournalCategory'), journalRegion: byId('discoveryJournalRegion'), result: byId('discoveryResultCard'),
    fieldGuide: byId('discoveryFieldGuideList'), collection: byId('discoveryCollectionList'),
    guideOverview: byId('discoveryGuideOverview'), guideSearch: byId('discoveryGuideSearch'), guideScope: byId('discoveryGuideScope'),
    lifeList: byId('discoveryLifeList'), retention: byId('discoveryRetentionDashboard'),
    guideCategory: byId('discoveryGuideCategory'), guideHelp: byId('discoveryGuideHelp'), guideHelpButton: byId('discoveryGuideHelpBtn'),
    companions: byId('discoveryCompanionList'), tools: byId('discoveryToolList'), progress: byId('discoveryProgress'), journeyOverview: byId('discoveryJourneyOverview'),
    equipped: byId('discoveryEquippedSummary'), openBackpack: byId('discoveryOpenBackpackBtn'),
    profileButton: byId('discoveryProfileBtn'), profileRank: byId('discoveryProfileRank'), profilePoints: byId('discoveryProfilePoints'), profileHero: byId('discoveryProfileHero'),
    tutorial: byId('discoveryTutorial'), tutorialTitle: byId('discoveryTutorialTitle'),
    tutorialSteps: byId('discoveryTutorialSteps'), tutorialDone: byId('discoveryTutorialDoneBtn'),
    sectionTutorial: byId('discoverySectionTutorial'), sectionTutorialTitle: byId('discoverySectionTutorialTitle'),
    sectionTutorialSteps: byId('discoverySectionTutorialSteps'), sectionTutorialDone: byId('discoverySectionTutorialDoneBtn'),
    inspection: byId('discoveryInspection'), arChallenge: byId('discoveryArChallengeBtn'), rank: byId('discoveryRankSummary'), goal: byId('discoveryGoal'),
    fieldSession: byId('discoveryFieldSession'), expedition: byId('discoveryExpeditionList'), expeditionMode: byId('discoveryExpeditionMode'),
    exportData: byId('discoveryExportBtn'), importData: byId('discoveryImportBtn'), importFile: byId('discoveryImportFile'), backupStatus: byId('discoveryBackupStatus')
  };
  const listeners = [];
  let activeTab = 'today';
  let open = false;
  let actionSignature = '';
  let guideRecords = [];
  let journalRecords = [];
  let expeditionSignature = '';
  let encounterPromptRevision = -1;
  let encounterPromptShownAt = 0;

  function listen(element, type, handler) {
    if (!element) return;
    element.addEventListener(type, handler);
    listeners.push(() => element.removeEventListener(type, handler));
  }

  function setOpen(next) {
    open = !!next;
    state.appCtx.screenLayout ||= getScreenLayoutService();
    state.appCtx.screenLayout.setPanelLayer('journal', open);
    elements.panel?.classList.toggle('show', open);
    elements.panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
    elements.quick?.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) void refreshData();
    return open;
  }

  function renderGuide() {
    if (!elements.fieldGuide) return;
    const search = String(elements.guideSearch?.value || '').trim().toLowerCase();
    const category = String(elements.guideCategory?.value || 'all');
    const requestedScope = String(elements.guideScope?.value || 'current');
    const regionalPack = resolveRegionalEcologyPack(state.publication.worldIdentity?.location);
    const currentRegionIds = new Set(regionalPack?.taxa?.map((entry) => entry.id) || []);
    const worldCatalog = BUILTIN_DISCOVERY_CATALOGS.fieldDiscoveries.filter((entry) =>
      entry.activityIds?.some((activityId) => RELEASED_EXPLORER_ACTIVITIES.has(activityId))
    );
    const scopedCatalog = requestedScope === 'current' && regionalPack
      ? worldCatalog.filter((entry) => currentRegionIds.has(entry.id))
      : worldCatalog;
    const companionCatalogIds = new Set(COMPANION_CATALOG.map((entry) => entry.id));
    const scopedGuide = requestedScope === 'current' && regionalPack
      ? guideRecords.filter((entry) => (currentRegionIds.has(entry.catalogId) || companionCatalogIds.has(entry.catalogId)) && entry.regions?.includes(state.worldIdentityId))
      : guideRecords;
    const knownIds = new Set(scopedGuide.map((entry) => entry.catalogId));
    const known = scopedGuide.filter((entry) => {
      const catalog = discoveryCatalogEntry(entry.catalogId);
      if (category !== 'all' && guideCategoryFor(entry) !== category) return false;
      const haystack = `${entry.name || ''} ${entry.family || ''} ${catalog?.names?.scientific || ''}`.toLowerCase();
      return !search || haystack.includes(search);
    });
    const unknown = scopedCatalog.filter((entry) => {
      if (knownIds.has(entry.id)) return false;
      if (category !== 'all' && guideCategoryFor(entry) !== category) return false;
      const haystack = `${entry.names?.common || ''} ${entry.family || ''} ${entry.names?.scientific || ''}`.toLowerCase();
      return !search || haystack.includes(search);
    });
    const knownMarkup = known.map((entry) => {
      const catalog = discoveryCatalogEntry(entry.catalogId);
      const regions = Array.isArray(entry.regionLabels) ? entry.regionLabels.filter(Boolean) : [];
      const owned = state.companionRuntime?.snapshot?.().companions?.filter((companion) => companion.catalogId === entry.catalogId) || [];
      const bestLevel = owned.reduce((highest, companion) => Math.max(highest, Number(companion.progression?.level || 1)), 0);
      const companionDetail = owned.length ? ` · ${owned.length} companion${owned.length === 1 ? '' : 's'} owned · best level ${bestLevel}` : '';
      return visualCard(entry, `${displayDiscoveryLabel(entry.family || catalog?.family)} · ${entry.observations || 1} observation${entry.observations === 1 ? '' : 's'} · ${regions.length || 1} region${regions.length === 1 ? '' : 's'}${companionDetail}`, 'field-guide');
    }).join('');
    const familyLabels = {
      'mammal-taxon': 'mammals',
      'bird-taxon': 'birds',
      'insect-arachnid-taxon': 'insects and arachnids',
      'plant-taxon': 'plants',
      'freshwater-fish-taxon': 'freshwater fish',
      'marine-fish-taxon': 'marine fish'
    };
    const unknownGroups = new Map();
    unknown.forEach((entry) => {
      const key = String(entry.family || 'discoveries');
      const group = unknownGroups.get(key) || { entries: [], activityIds: new Set() };
      group.entries.push(entry);
      entry.activityIds?.filter((id) => RELEASED_EXPLORER_ACTIVITIES.has(id)).forEach((id) => group.activityIds.add(id));
      unknownGroups.set(key, group);
    });
    const unknownMarkup = [...unknownGroups.entries()].map(([family, group]) => {
      const label = familyLabels[family] || displayDiscoveryLabel(family, 'discoveries').replace(/ taxon$/i, '').toLowerCase();
      const methods = [...group.activityIds].slice(0, 3).map((id) => displayDiscoveryLabel(id)).join(', ');
      return `<article class="discoveryItem discoveryUnknown"><span class="discoveryUnknownMark" aria-hidden="true">?</span><div><strong>${group.entries.length} ${escapeHtml(label)} left to identify</strong><small>${methods ? `Try ${escapeHtml(methods)} in a suitable place.` : 'Explore a suitable place to begin.'}</small></div></article>`;
    }).join('');
    elements.fieldGuide.innerHTML = knownMarkup || unknownMarkup
      ? `${knownMarkup}${unknownMarkup}`
      : '<div class="discoveryEmpty">No Guide entries match this search.</div>';
    if (elements.guideOverview) {
      const total = new Set([...scopedCatalog.map((entry) => entry.id), ...knownIds]).size;
      const scopeLabel = requestedScope === 'current' && regionalPack ? `${state.regionLabel} area` : 'World';
      elements.guideOverview.innerHTML = `<article><strong>${knownIds.size}</strong><span>identified here</span></article><article><strong>${Math.max(0, total - knownIds.size)}</strong><span>left to discover</span></article><article><strong>${escapeHtml(scopeLabel)}</strong><span>Guide scope</span></article>`;
    }
  }

  function renderJournal() {
    if (!elements.journal) return;
    const path = String(elements.journalCategory?.value || 'all');
    const regionId = String(elements.journalRegion?.value || 'all');
    const filtered = journalRecords.filter((event) =>
      (path === 'all' || (event.pathId || 'field') === path) &&
      (regionId === 'all' || event.regionId === regionId)
    );
    const pathLabels = { field: 'Fieldwork', activity: 'Games', creation: 'Making', travel: 'Travel', community: 'Community', companion: 'Companions' };
    elements.journal.innerHTML = filtered.length ? filtered.slice(0, 16).map((event) => {
      const when = new Date(Number(event.occurredAt) || Date.now()).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const connections = [
        event.projections?.fieldGuide ? 'also in Field Guide' : '',
        event.projections?.collection ? 'also in Backpack' : ''
      ].filter(Boolean).join(' + ');
      const canReturn = event.locationKey || (Number.isFinite(event.locationSnapshot?.lat) && Number.isFinite(event.locationSnapshot?.lon));
      const returnButton = canReturn ? `<button class="discoveryJournalReturn" data-journal-return="${escapeHtml(event.eventId)}" type="button">Return to location</button>` : '';
      const activity = displayDiscoveryLabel(event.activityId || event.eventType || event.pathId, 'Explorer memory');
      const eventPath = event.pathId || 'field';
      return `<article class="discoveryItem discoveryJournalEvent"><span class="discoveryJournalTime">${escapeHtml(when)}</span><span class="discoveryJournalPath">${escapeHtml(pathLabels[eventPath] || 'Explorer')}</span><strong>${escapeHtml(event.name || 'Explorer record')}</strong><small>${escapeHtml(`${event.regionLabel || 'Current region'} · ${activity}${connections ? ` · ${connections}` : ''}`)}</small>${event.detail ? `<small>${escapeHtml(event.detail)}</small>` : ''}<span class="discoveryJournalProgress">${event.progress?.points > 0 ? `+${event.progress.points} Explorer points` : 'Saved to your Journal'}</span>${returnButton}</article>`;
    }).join('') : '<div class="discoveryEmpty">No Journal records match these filters.</div>';
  }

  async function refreshData() {
    const [profile, items, guide, events] = await Promise.all([
      state.profileStore.getProfile(),
      state.profileStore.listItems(100),
      state.profileStore.listFieldGuide?.(200) || [],
      state.profileStore.listEvents?.(100) || []
    ]);
    guideRecords = guide;
    journalRecords = events;
    projectDiscoveryItemsToBackpack(state.appCtx, items);
    if (elements.journalRegion) {
      const selectedRegion = elements.journalRegion.value || 'all';
      const regions = [...new Map(events.filter((event) => event.regionId).map((event) => [event.regionId, event.regionLabel || 'Saved region'])).entries()];
      elements.journalRegion.innerHTML = `<option value="all">All regions</option>${regions.map(([id, label]) => `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`).join('')}`;
      elements.journalRegion.value = regions.some(([id]) => id === selectedRegion) ? selectedRegion : 'all';
    }
    const rank = explorerProgressSnapshot(profile.explorerProgress);
    if (elements.rank) elements.rank.innerHTML = `<span>EXPLORER RANK</span><strong>${escapeHtml(rank.rankLabel)}</strong><small>${rank.next ? `${rank.next.pointsRemaining} points to ${escapeHtml(rank.next.label)} · find something new or explore a new place` : 'Highest current rank · keep exploring and building your story'}</small>`;
    const goal = explorerGoalSnapshot({ profile, guide, items, events, regionId: state.worldIdentityId, regionLabel: state.regionLabel });
    if (elements.goal) elements.goal.innerHTML = `<div class="discoveryGoalCopy"><span>CURRENT GOAL</span><strong>${escapeHtml(goal.label)}</strong><small>${escapeHtml(goal.detail)}</small></div><div class="discoveryGoalMeter" aria-label="${escapeHtml(`${goal.current} of ${goal.target}`)}"><i style="width:${goal.progressPercent}%"></i></div><div class="discoveryGoalFoot"><b>${goal.current}/${goal.target}</b><span>${escapeHtml(goal.reward)}</span></div>`;
    const regionalPack = resolveRegionalEcologyPack(state.publication.worldIdentity?.location);
    const retention = createFieldRetentionSnapshot({
      profile, guide, events,
      regionId: state.worldIdentityId,
      regionLabel: state.regionLabel,
      regionalPack
    });
    state.retentionSnapshot = retention;
    if (elements.retention) {
      const rhythm = [retention.daily, retention.weekly, retention.seasonal].map((period) => {
        const objectives = period.objectives || [period.objective];
        const programNote = period.phase === 'ineligible'
          ? 'Seasonal surveys are not available in this place yet.'
          : 'Personal field progress · missed days never remove permanent records';
        return `<article class="discoveryRetentionCard" data-mission-phase="${escapeHtml(period.phase)}"><span>${escapeHtml(period.label)}</span>${objectives.map((entry) => `<div class="discoveryRetentionObjective${entry.complete ? ' complete' : ''}"><div><strong>${entry.complete ? '✓ ' : ''}${escapeHtml(entry.label)}</strong><small>${escapeHtml(entry.detail)}</small></div><b>${Math.min(entry.current, entry.target)}/${entry.target}</b><i><em style="width:${entry.progressPercent}%"></em></i></div>`).join('')}<small>${escapeHtml(programNote)}</small></article>`;
      }).join('');
      elements.retention.innerHTML = `<article class="discoveryReturnFocus"><strong>${escapeHtml(retention.returnFocus.label)}</strong><small>${escapeHtml(retention.returnFocus.detail)}</small><span>NO STREAK LOSS</span></article>${rhythm}`;
    }
    renderGuide();
    if (elements.lifeList) {
      const groups = retention.lifeList.groups.filter((entry) => entry.target > 0);
      const methods = retention.evidenceSpecialties.filter((entry) => entry.records > 0);
      elements.lifeList.innerHTML = regionalPack
        ? `<div class="discoveryLifeListHead"><div><span>REGIONAL LIFE LIST</span><strong>${retention.lifeList.identified}/${retention.lifeList.target}</strong></div><small>Guide progress · not a live wildlife count</small></div><div class="discoveryLifeListGrid">${groups.map((entry) => `<article><span>${escapeHtml(entry.label)}</span><b>${entry.current}/${entry.target}</b><i><em style="width:${Math.min(100, Math.round(entry.current / Math.max(1, entry.target) * 100))}%"></em></i></article>`).join('')}</div><div class="discoveryEvidenceSpecialties"><span>WAYS YOU EXPLORE</span><small>${methods.length ? methods.map((entry) => `${displayDiscoveryLabel(entry.id)} ${entry.records}`).join(' · ') : 'Complete a field record to begin.'}</small></div>`
        : '<div class="discoveryEmpty">Regional life lists appear in places with a dedicated Field Guide.</div>';
    }
    renderJournal();
    if (elements.collection) {
      const places = [...new Map(events.filter((event) => event.regionId).map((event) => [event.regionId, {
        id: event.regionId,
        label: event.regionLabel || 'Saved region',
        count: events.filter((candidate) => candidate.regionId === event.regionId).length,
        lastAt: Math.max(...events.filter((candidate) => candidate.regionId === event.regionId).map((candidate) => Number(candidate.occurredAt) || 0))
      }])).values()].sort((left, right) => right.lastAt - left.lastAt);
      elements.collection.innerHTML = places.length ? places.map((place) => {
        const latest = events.find((event) => event.regionId === place.id && (event.locationKey || (Number.isFinite(event.locationSnapshot?.lat) && Number.isFinite(event.locationSnapshot?.lon))));
        return `<article class="discoveryItem"><strong>${escapeHtml(place.label)}</strong><small>${place.count} Journal record${place.count === 1 ? '' : 's'} · saved Explorer place</small>${latest ? `<button class="discoveryJournalReturn" data-journal-return="${escapeHtml(latest.eventId)}" type="button">Return to place</button>` : ''}</article>`;
      }).join('') : '<div class="discoveryEmpty">Complete an activity or observation to add its region to Places.</div>';
    }
    if (elements.tools) {
      const equippedToolId = String(state.equippedToolId || 'field-lens');
      const available = state.entitlements.listAvailableTools();
      const lockedProgress = new Map((state.toolProgress?.lockedTools || []).map((entry) => [entry.toolId, entry]));
      const availableMarkup = available.map((tool) =>
        `<article class="discoveryItem discoveryGearItem${tool.id === equippedToolId ? ' equipped' : ''}"><strong>${escapeHtml(tool.label)}${tool.id === equippedToolId ? ' · Ready for fieldwork' : ' · In Backpack'}</strong><small>${escapeHtml(TOOL_FIELD_USE[tool.id] || tool.capabilities.map((value) => displayDiscoveryLabel(value)).join(' · '))}</small><span class="discoveryGearCapabilities">${escapeHtml(tool.capabilities.map((value) => displayDiscoveryLabel(value)).join(' · '))}</span><div class="discoveryCompanionActions"><button data-tool-help="${escapeHtml(tool.id)}" type="button">How to use</button></div></article>`
      ).join('');
      const lockedMarkup = state.entitlements.listLockedTools().map((tool) => {
        const unlock = lockedProgress.get(tool.id);
        return `<article class="discoveryItem discoveryGearItem locked"><span class="discoveryGearLock">LOCKED</span><strong>${escapeHtml(tool.label)}</strong><small>${escapeHtml(TOOL_FIELD_USE[tool.id] || 'A later Explorer capability.')}</small><span class="discoveryGearUnlock">${escapeHtml(unlock?.label || 'Raise Explorer rank')} · ${unlock?.pointsRemaining || 0} points remaining</span></article>`;
      }).join('');
      elements.tools.innerHTML = `${availableMarkup}${lockedMarkup}`;
      const equippedTool = state.entitlements.listAvailableTools().find((tool) => tool.id === equippedToolId);
      if (elements.equipped) elements.equipped.innerHTML = `<span>BACKPACK FIELD TOOL</span><strong>${escapeHtml(equippedTool?.label || 'Field Lens')}</strong><small>${escapeHtml(equippedTool ? equippedTool.capabilities.map((value) => displayDiscoveryLabel(value)).join(' · ') : 'Inspect · Classify')}</small>`;
    }
    const companionSnapshot = state.companionRuntime?.snapshot?.() || { companions: [], presentation: {} };
    const ownedCompanions = companionSnapshot.companions || [];
    if (elements.companions) {
      const owned = ownedCompanions;
      const activeTravelLabel = ['aboard', 'vehicle-occupant'].includes(companionSnapshot.presentation?.travelState)
        ? 'Riding with you'
        : companionSnapshot.presentation?.travelState === 'waiting' ? 'Waiting for you' : 'Following';
      const localSuggestions = COMPANION_CATALOG.filter((catalog) =>
        FIRST_RELEASE_COMPANION_IDS.has(catalog.id) &&
        !owned.some((companion) => companion.catalogId === catalog.id) &&
        state.isCompanionEligible?.(catalog) === true
      ).sort((left, right) => Number(state.hasWorldCompanionEncounter?.(right.id)) - Number(state.hasWorldCompanionEncounter?.(left.id))).slice(0, 4);
      const companionRows = [
        ...owned.map((companion) => ({ companion, catalog: COMPANION_CATALOG.find((entry) => entry.id === companion.catalogId) })).filter((row) => row.catalog),
        ...localSuggestions.map((catalog) => ({ catalog, companion: null }))
      ];
      elements.companions.innerHTML = companionRows.length ? companionRows.map(({ catalog, companion }) => {
        if (!companion) {
          const releaseReady = FIRST_RELEASE_COMPANION_IDS.has(catalog.id);
          const eligible = releaseReady && state.isCompanionEligible?.(catalog) === true && state.hasWorldCompanionEncounter?.(catalog.id) === true;
          const encounter = state.companionEncounterState?.(catalog.id) || { step: 0 };
          const guidance = eligible
            ? encounter.trustState === 'Comfortable'
              ? 'Comfortable — choose a name when you are ready.'
              : `${encounter.trustState || 'Wary'} — meet this animal in the world and follow its response.`
            : releaseReady
              ? 'Explore a compatible area to meet one.'
              : 'Observation only for now.';
          const visual = visualForCatalogId(catalog.id);
          const nameAndBefriend = eligible && encounter.trustState === 'Comfortable'
            ? `<div class="discoveryCompanionName"><label>Name this companion<input data-companion-name maxlength="24" autocomplete="off" value="${escapeHtml(catalog.names.common)}"></label><button data-companion-action="befriend" data-companion-catalog="${escapeHtml(catalog.id)}" type="button">Befriend</button></div>`
            : eligible ? `<div class="discoveryCompanionActions"><button data-companion-action="locate" data-companion-catalog="${escapeHtml(catalog.id)}" type="button">Find in world</button></div>` : '';
          return `<article class="discoveryItem${visual ? ' discoveryItemVisual' : ''}">${visual ? `<img src="${escapeHtml(visual.image)}" alt="${escapeHtml(visual.alt)}" loading="lazy"><div>` : ''}<strong>${escapeHtml(catalog.names.common)}</strong><small>${escapeHtml(guidance)}</small>${nameAndBefriend}${visual ? '</div>' : ''}</article>`;
        }
        const visual = visualForCatalogId(companion.catalogId);
        const level = Number(companion.progression?.level || 1);
        const nextLevel = companion.progression?.nextLevelXp == null
          ? 'Master Partner'
          : `${Math.max(0, companion.progression.nextLevelXp - companion.progression.totalXp)} XP to level ${level + 1}`;
        const lastAward = companion.progression?.lastAward
          ? ` · Last: +${companion.progression.lastAward.points} ${companion.progression.lastAward.label}`
          : '';
        const specialty = companion.training?.specialization ? ` · Specialty: ${companion.training.specialization}` : '';
        return `<article class="discoveryItem${visual ? ' discoveryItemVisual' : ''}">${visual ? `<img src="${escapeHtml(visual.image)}" alt="${escapeHtml(visual.alt)}" loading="lazy"><div>` : ''}<strong>${escapeHtml(companion.name)}${companion.active ? ' · Active' : ''}</strong><small>${escapeHtml(`Level ${level} · ${companion.progression?.trustState || 'Comfortable'} · ${nextLevel}${specialty}${lastAward}`)}</small><div class="discoveryCompanionActions"><button class="${companion.active ? 'active' : ''}" data-companion-action="activate" data-companion-id="${escapeHtml(companion.instanceId)}" type="button" ${companion.active ? 'disabled' : ''}>${companion.active ? activeTravelLabel : 'Set active'}</button><button data-companion-action="care" data-companion-id="${escapeHtml(companion.instanceId)}" type="button">Care</button>${level >= 2 ? `<button data-companion-action="recall-training" data-companion-id="${escapeHtml(companion.instanceId)}" type="button">Practice Recall</button>` : ''}<button class="discoveryArLaunch" data-companion-action="ar" data-companion-id="${escapeHtml(companion.instanceId)}" type="button">View in AR</button></div>${visual ? '</div>' : ''}</article>`;
      }).join('') : '<div class="discoveryEmpty">Explore animal-friendly places to meet a potential companion.</div>';
    }
    if (elements.progress) {
      const progress = rank;
      const regional = regionalProgressSnapshot({ guide, events, regionId: state.worldIdentityId, regionLabel: state.regionLabel });
      const specialties = Object.entries(profile.characterState?.specialties || {})
        .filter(([, specialty]) => Number(specialty.xp) > 0)
        .sort((left, right) => Number(right[1].xp) - Number(left[1].xp));
      const pathLabels = { field: 'Fieldwork', activity: 'Games', creation: 'Making', travel: 'Travel', community: 'Community', companion: 'Companions' };
      const paths = Object.entries(progress.paths || {}).filter(([, path]) => path.records > 0);
      const badges = progress.badgeAwards || [];
      const activeCompanion = ownedCompanions.find((entry) => entry.active);
      const background = definitionById(BACKGROUND_DEFINITIONS, profile.characterState?.backgroundId) || BACKGROUND_DEFINITIONS[0];
      const strengths = ATTRIBUTE_DEFINITIONS.map((definition) => ({
        ...definition,
        value: Number(profile.characterState?.attributes?.[definition.id]) || 0
      })).sort((left, right) => right.value - left.value || left.label.localeCompare(right.label)).slice(0, 3);
      if (elements.profileRank) elements.profileRank.textContent = progress.rankLabel;
      if (elements.profilePoints) elements.profilePoints.textContent = String(progress.points);
      if (elements.profileHero) {
        elements.profileHero.innerHTML = `<div><span>${escapeHtml(background.label)}</span><strong>${escapeHtml(progress.rankLabel)}</strong><small>${progress.points} Explorer points · ${progress.totalRecords || 0} Journal memories</small></div><div class="discoveryProfileStrengths"><span>Current strengths</span><b>${strengths.map((entry) => escapeHtml(entry.label)).join(' · ')}</b></div>${activeCompanion ? `<div class="discoveryProfileCompanion"><span>Exploring with</span><strong>${escapeHtml(activeCompanion.name)}</strong><small>Level ${activeCompanion.progression?.level || 1} · ${escapeHtml(activeCompanion.progression?.trustState || 'Comfortable')}</small></div>` : ''}`;
      }
      if (elements.journeyOverview) {
        const routeCards = [
          { id: 'today', label: 'Discover', detail: 'Observe, photograph, survey, and add what you learn to your Journal.', records: Number(progress.paths?.field?.records || 0) + Number(progress.paths?.activity?.records || 0) },
          { id: 'travel', label: 'Travel', detail: 'Explore cities, oceans, planets, and the journeys between them.', records: Number(progress.paths?.travel?.records || 0) },
          { id: 'create', label: 'Create', detail: 'Shape virtual places, build with blocks, and grow a place of your own.', records: Number(progress.paths?.creation?.records || 0) },
          { id: 'community', label: 'Explore Together', detail: 'Join rooms, share expeditions, and take part in the Explorer board.', records: Number(progress.paths?.community?.records || 0) },
          { id: 'companion', label: 'Companions', detail: 'Meet, befriend, care for, and train animals that travel with you.', records: Number(progress.paths?.companion?.records || 0) }
        ];
        const nextRoute = routeCards.reduce((lowest, route) => route.records < lowest.records ? route : lowest, routeCards[0]);
        elements.journeyOverview.innerHTML = `<div class="discoveryJourneyIntro"><span>YOUR WORLD</span><strong>Choose what kind of day you want</strong><small>Every route adds to the same Explorer story. You can change direction whenever you like.</small><b>Try next · ${escapeHtml(nextRoute.label)}</b></div><div class="discoveryJourneyRoutes">${routeCards.map((route) => `<button type="button" data-explorer-route="${escapeHtml(route.id)}"${route.id === nextRoute.id ? ' class="suggested"' : ''}><span>${escapeHtml(route.label)}</span><small>${escapeHtml(route.detail)}</small><b>${route.records ? `${route.records} ${route.records === 1 ? 'memory' : 'memories'}` : 'Ready to begin'}</b></button>`).join('')}</div>`;
      }
      const specialtyMarkup = specialties.length
        ? specialties.map(([id, specialty]) => { const definition = definitionById(SPECIALTY_DEFINITIONS, id); const specialtyRank = rankForXp(SPECIALTY_RANKS, specialty.xp); return `<article class="discoveryProgressCard"><strong>${specialtyRank.rank}</strong>${escapeHtml(definition?.label || displayDiscoveryLabel(id))}<small>${escapeHtml(specialtyRank.label)} · ${specialty.meaningfulEvents || 0} meaningful activities</small></article>`; }).join('')
        : '<div class="discoveryEmpty">Complete meaningful activities to begin developing specialties.</div>';
      const pathMarkup = paths.length
        ? paths.map(([id, path]) => `<article class="discoveryProgressCard"><strong>${path.records}</strong>${escapeHtml(pathLabels[id] || displayDiscoveryLabel(id))}<small>${path.points || 0} points · ${path.firsts || 0} first-time milestone${path.firsts === 1 ? '' : 's'}</small></article>`).join('')
        : '<div class="discoveryEmpty">Your first Journal memory will begin your Explorer paths.</div>';
      const badgeMarkup = badges.length
        ? badges.map((badge) => `<article class="discoveryProgressCard"><strong>◆</strong>${escapeHtml(badge.label)}<small>Explorer badge</small></article>`).join('')
        : '<div class="discoveryEmpty">Badges appear as your Explorer story grows.</div>';
      elements.progress.innerHTML = `<details class="discoveryProfileGroup" open><summary>Specialties <span>${specialties.length}</span></summary><div class="discoveryProfileGroupGrid">${specialtyMarkup}</div></details><details class="discoveryProfileGroup"><summary>Explorer paths <span>${paths.length}</span></summary><div class="discoveryProfileGroupGrid">${pathMarkup}</div></details><details class="discoveryProfileGroup"><summary>Current place</summary><article class="discoveryRegionalProgress"><div><span>CURRENT REGION</span><strong>${escapeHtml(regional.regionLabel)}</strong><small>${regional.journalEvents} Journal records · ${regional.identifications} identifications</small></div>${regional.categories.map((category) => `<div class="discoveryRegionalRow"><span>${escapeHtml(category.label)}</span><b>${Math.min(category.current, category.target)}/${category.target}</b><i><em style="width:${Math.min(100, Math.round(category.current / category.target * 100))}%"></em></i></div>`).join('')}</article></details><details class="discoveryProfileGroup"><summary>Badges <span>${badges.length}</span></summary><div class="discoveryProfileGroupGrid">${badgeMarkup}</div></details>`;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function visualCard(record, meta = '', source = 'field-guide') {
    const catalog = discoveryCatalogEntry(record.catalogId);
    const visual = visualForCatalogId(record.catalogId);
    const name = record.name || catalog?.names?.common || record.catalogId;
    const details = meta || `${displayDiscoveryLabel(record.family || catalog?.family)} · ${displayDiscoveryLabel(record.evidenceClass, 'Field reference')}`;
    if (!visual) return `<article class="discoveryItem"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(details)}</small></article>`;
    return `<article class="discoveryItem discoveryItemVisual"><img src="${escapeHtml(visual.image)}" alt="${escapeHtml(visual.alt)}" loading="lazy"><div><strong>${escapeHtml(name)}</strong><div class="discoveryScientific">${escapeHtml(catalog?.names?.scientific || visual.scientificName)}</div><small>${escapeHtml(details)}</small><span class="discoveryEvidence">Reference image</span><a class="discoveryCredit" href="${escapeHtml(visual.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(`${visual.author} · ${visual.license}`)}</a><div class="discoveryCompanionActions"><button class="discoveryArLaunch" data-ar-record="${escapeHtml(record.instanceId || record.catalogId)}" data-ar-source="${escapeHtml(source)}" type="button">Place in AR</button></div></div></article>`;
  }

  function setTab(tab) {
    const normalizedTab = tab === 'gear' || tab === 'progress' ? 'profile' : tab === 'collection' ? 'journal' : tab;
    activeTab = ['today', 'journal', 'guide', 'profile'].includes(normalizedTab) ? normalizedTab : 'today';
    const tabTitles = { today: 'Today', journal: 'Journal', guide: 'Field Guide', profile: 'My Explorer' };
    if (elements.title) elements.title.textContent = tabTitles[activeTab] || 'Today';
    document.querySelectorAll('[data-discovery-tab]').forEach((button) => button.classList.toggle('active', button.dataset.discoveryTab === activeTab));
    elements.profileButton?.classList.toggle('active', activeTab === 'profile');
    elements.profileButton?.setAttribute('aria-pressed', activeTab === 'profile' ? 'true' : 'false');
    elements.profileButton?.setAttribute('aria-label', activeTab === 'profile' ? 'Return to Today' : 'Open My Explorer profile');
    document.querySelectorAll('.discoveryPane').forEach((pane) => pane.classList.toggle('active', pane.dataset.discoveryPane === activeTab));
    const activePane = document.querySelector(`.discoveryPane[data-discovery-pane="${activeTab}"]`);
    if (activePane) activePane.scrollTop = 0;
    globalThis.dispatchEvent?.(new CustomEvent('we3d:explorer-section-opened', { detail: { section: activeTab } }));
    if (activeTab !== 'today') void refreshData();
  }

  function showResult(outcome) {
    const event = outcome?.event;
    if (!elements.result) return false;
    if (!event) {
      elements.result.hidden = true;
      elements.result.innerHTML = '';
      return false;
    }
    const collection = event.projections?.collection === true;
    const points = Number(event.progress?.points) || 0;
    const specialtyAwards = outcome?.characterReward?.specialtyAwards || [];
    const specialtySummary = specialtyAwards.slice(0, 2).map((award) => {
      const label = definitionById(SPECIALTY_DEFINITIONS, award.id)?.label || displayDiscoveryLabel(award.id);
      return `${label} +${award.xp}`;
    }).join(' · ');
    const rewardSummary = [points > 0 ? `Explorer +${points}` : '', specialtySummary].filter(Boolean).join(' · ');
    elements.result.hidden = false;
    elements.result.innerHTML = `<span class="discoveryResultEyebrow">FIELD RESULT SAVED</span><strong>${escapeHtml(event.name || 'Explorer record')}</strong><p>${escapeHtml(collection ? 'Journal updated · Field Guide updated · Added to Backpack' : 'Journal and Field Guide updated')}</p><div class="discoveryResultProgress">${escapeHtml(rewardSummary || 'Observation saved · already credited here')}</div><div class="discoveryResultActions"><button data-result-tab="guide" type="button">Open Field Guide</button>${collection ? '<button data-open-backpack="true" type="button">Open Backpack</button>' : ''}<button data-result-tab="profile" type="button">My Explorer</button></div>`;
    document.querySelector('.discoveryPane[data-discovery-pane="today"]')?.scrollTo?.({ top: 0 });
    return true;
  }

  document.querySelectorAll('[data-discovery-tab]').forEach((button) => listen(button, 'click', () => setTab(button.dataset.discoveryTab || 'today')));
  document.querySelectorAll('[data-discovery-destination="pack"]').forEach((button) => listen(button, 'click', () => {
    setOpen(false);
    state.appCtx.toggleUrbanEquipment?.(true);
  }));
  listen(elements.todayBackpack, 'click', () => {
    setOpen(false);
    state.appCtx.toggleUrbanEquipment?.(true);
  });
  listen(elements.profileButton, 'click', () => setTab(activeTab === 'profile' ? 'today' : 'profile'));
  listen(elements.quick, 'click', () => setOpen(!open));
  listen(elements.menu, 'click', () => {
    document.querySelectorAll('.floatMenu').forEach((menu) => menu.classList.remove('open'));
    setTab('today');
    setOpen(true);
  });
  listen(elements.journeyOverview, 'click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-explorer-route]') : null;
    if (!button) return;
    const route = String(button.dataset.explorerRoute || 'today');
    if (route === 'today') {
      setTab('today');
      return;
    }
    if (route === 'companion') {
      setTab('profile');
      requestAnimationFrame(() => document.querySelector('.discoveryCompanionSection')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }));
      return;
    }
    const destination = {
      travel: 'travelBtn',
      create: 'realEstateFloatBtn',
      community: 'gameBtn'
    }[route];
    if (!destination) return;
    setOpen(false);
    requestAnimationFrame(() => document.getElementById(destination)?.click());
  });
  listen(elements.promptOpen, 'click', () => {
    if (state.encounterLead?.available) void state.startEncounterLead?.();
    else setOpen(true);
  });
  listen(elements.close, 'click', () => setOpen(false));
  listen(elements.help, 'click', () => void state.showSectionTutorial?.(activeTab === 'today' ? 'workspace' : activeTab, true));
  listen(elements.guideHelpButton, 'click', () => {
    if (!elements.guideHelp) return;
    elements.guideHelp.hidden = !elements.guideHelp.hidden;
    elements.guideHelpButton.setAttribute('aria-expanded', elements.guideHelp.hidden ? 'false' : 'true');
  });
  listen(elements.guideSearch, 'input', renderGuide);
  listen(elements.guideScope, 'change', renderGuide);
  listen(elements.guideCategory, 'change', renderGuide);
  listen(elements.journalCategory, 'change', renderJournal);
  listen(elements.journalRegion, 'change', renderJournal);
  listen(elements.journal, 'click', (event) => {
    const button = event.target?.closest?.('[data-journal-return]');
    if (button) void state.returnToJournalEvent?.(button.dataset.journalReturn);
  });
  listen(elements.tutorialDone, 'click', () => void state.dismissActivityTutorial());
  listen(elements.sectionTutorialDone, 'click', () => void state.dismissActivityTutorial());
  listen(elements.primary, 'click', () => void state.handlePrimary());
  listen(elements.secondary, 'click', () => void state.handleSecondary());
  listen(elements.actions, 'click', (event) => {
    const button = event.target?.closest?.('[data-discovery-action]');
    if (button) void state.selectActivity(button.dataset.discoveryAction);
  });
  listen(elements.expedition, 'click', (event) => {
    const button = event.target?.closest?.('[data-field-objective]');
    if (button) void state.startFieldObjective?.(button.dataset.fieldObjective);
  });
  listen(elements.companions, 'click', (event) => {
    const button = event.target?.closest?.('[data-companion-action]');
    if (button) {
      const name = button.closest('.discoveryItem')?.querySelector?.('[data-companion-name]')?.value || '';
      void state.handleCompanionAction(button.dataset.companionAction, button.dataset.companionId, button.dataset.companionCatalog, name);
    }
  });
  listen(elements.tools, 'click', (event) => {
    const help = event.target?.closest?.('[data-tool-help]');
    if (help) void state.showToolHelp?.(help.dataset.toolHelp);
  });
  listen(elements.openBackpack, 'click', () => {
    setOpen(false);
    state.appCtx.toggleUrbanEquipment?.(true);
  });
  listen(elements.exportData, 'click', async () => {
    try {
      const data = await state.profileStore.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `world-explorer-journal-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      if (elements.backupStatus) elements.backupStatus.textContent = 'Journal backup downloaded.';
    } catch (error) {
      if (elements.backupStatus) elements.backupStatus.textContent = error?.message || 'The backup could not be created.';
    }
  });
  listen(elements.importData, 'click', () => elements.importFile?.click());
  listen(elements.importFile, 'change', async () => {
    const file = elements.importFile?.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!globalThis.confirm?.('Restore this Journal backup? Current local Explorer records in this browser will be replaced.')) return;
      const result = await state.profileStore.importData(data);
      await refreshData();
      if (elements.backupStatus) elements.backupStatus.textContent = `Restored ${result.events} Journal memories and ${result.guide} Guide entries.`;
    } catch (error) {
      if (elements.backupStatus) elements.backupStatus.textContent = error?.message || 'This backup could not be restored.';
    } finally {
      if (elements.importFile) elements.importFile.value = '';
    }
  });
  listen(elements.result, 'click', (event) => {
    if (event.target?.closest?.('[data-open-backpack]')) {
      setOpen(false);
      state.appCtx.toggleUrbanEquipment?.(true);
      return;
    }
    const button = event.target?.closest?.('[data-result-tab]');
    if (button) setTab(button.dataset.resultTab || 'today');
  });
  [elements.fieldGuide, elements.collection].forEach((container) => listen(container, 'click', (event) => {
    const returnButton = event.target?.closest?.('[data-journal-return]');
    if (returnButton) {
      void state.returnToJournalEvent?.(returnButton.dataset.journalReturn);
      return;
    }
    const button = event.target?.closest?.('[data-ar-record]');
    if (button) void state.handleArRecord(button.dataset.arRecord, button.dataset.arSource);
  }));
  listen(elements.arChallenge, 'click', () => void state.handleArChallenge());

  function render(actions, snapshot, activityId = 'metal-detect') {
    const liveGps = state.appCtx.getLiveGpsSnapshot?.() || { active: false };
    if (elements.expeditionMode) elements.expeditionMode.textContent = liveGps.active
      ? 'THREE GPS WALKING STOPS'
      : 'THREE NEARBY FIELD STOPS';
    const expedition = state.fieldExpedition?.snapshot?.(
      playerPosition(state.appCtx),
      liveGps.active ? (target) => state.evaluateFieldTarget?.(target) : null
    );
    if (elements.fieldSession) {
      elements.fieldSession.hidden = !liveGps.active;
      if (liveGps.active) {
        const field = liveGps.fieldSession || {};
        const status = field.pauseReason ? displayDiscoveryLabel(field.pauseReason, 'Held') : 'Eligible walking session';
        elements.fieldSession.innerHTML = `<div><span>LIVE GPS WALK</span><strong>${escapeHtml(status)}</strong><small>${Math.round(Number(field.trustedDistanceMeters || 0))} m trusted walking · raw route not saved</small></div><b>${expedition?.completedCount || 0}/${expedition?.objectiveCount || 0}</b>`;
        elements.fieldSession.dataset.state = field.pauseReason ? 'held' : 'eligible';
      }
    }
    if (elements.expedition) {
      const rows = expedition?.objectives || [];
      const nextSignature = rows.map((row) => `${row.slotId}:${row.complete}:${Math.round(Number(row.distanceMeters || 0) / 5)}:${row.proximityState}:${row.pauseReason || ''}`).join('|');
      if (nextSignature !== expeditionSignature) {
        expeditionSignature = nextSignature;
        elements.expedition.innerHTML = rows.length ? rows.map((row) => {
          const stateLabel = row.complete ? 'Saved' : row.pauseReason ? displayDiscoveryLabel(row.pauseReason, 'Held') : row.distanceMeters == null ? 'Waiting for GPS' : `${Math.ceil(row.distanceMeters)} m · ${displayDiscoveryLabel(row.proximityState, 'Follow bearing')}`;
          return `<button class="discoveryExpeditionStop${row.complete ? ' complete' : ''}" data-field-objective="${escapeHtml(row.slotId)}" type="button" ${row.complete ? 'disabled' : ''}><span>${row.complete ? '✓' : row.index + 1}</span><div><strong>${escapeHtml(row.targetLabel)}</strong><small>${escapeHtml(stateLabel)}</small></div></button>`;
        }).join('') : '<div class="discoveryEmpty">Walk into another survey area to prepare three available field stops.</div>';
      }
    }
    const detectorAvailable = actions.some((action) => action.id === 'metal-detect');
    const operationActive = !!snapshot?.active && !['complete', 'collected', 'recorded', 'left'].includes(snapshot?.phase);
    elements.quick?.classList.toggle('show', state.active && !open && operationActive && (detectorAvailable || activityId !== 'metal-detect'));
    const encounterLead = state.encounterLead || null;
    // A world-space action within reach (observe wildlife, enter a vehicle,
    // inspect an object) is more urgent than a broader walking lead. The lead
    // remains available and returns as soon as the direct interaction clears.
    const directInteraction = state.appCtx.resolvePrimaryContextInteraction?.() || null;
    const interiorInteraction = document.getElementById('interiorPrompt')?.classList.contains('show') === true;
    const encounterPromptEligible = !open && !operationActive && !directInteraction && !interiorInteraction && encounterLead?.available === true;
    const encounterRevision = Number(encounterLead?.revision);
    const promptNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!encounterLead?.available) {
      encounterPromptRevision = -1;
      encounterPromptShownAt = 0;
    } else if (encounterPromptEligible && encounterRevision !== encounterPromptRevision) {
      encounterPromptRevision = encounterRevision;
      encounterPromptShownAt = promptNow;
    }
    // A field lead is an invitation, not a permanent HUD layer. Keep the
    // underlying lead available in Explorer after this short notice expires.
    const showEncounterLead = encounterPromptEligible && promptNow - encounterPromptShownAt < 7000;
    elements.prompt?.classList.toggle('show', showEncounterLead);
    if (elements.prompt) {
      elements.prompt.dataset.tone = encounterLead?.tone || 'field';
      elements.prompt.dataset.mode = encounterLead?.mode || 'free-roam';
    }
    if (elements.promptText) elements.promptText.textContent = showEncounterLead
      ? `${encounterLead.leadLabel} · ${Math.ceil(Number(encounterLead.distanceMeters || 0))} m ${compactCompassDirection(encounterLead.bearingDegrees)} · field lead`
      : actions.length
        ? `${actions.slice(0, 3).map((action) => action.label).join(' · ')} available here`
        : 'Inspect the current area.';
    if (elements.promptOpen) elements.promptOpen.textContent = showEncounterLead ? 'Track Lead' : 'Explore';
    const nextSignature = `${activityId}|${actions.map((action) => action.id).join('|')}`;
    if (elements.actions && nextSignature !== actionSignature) {
      actionSignature = nextSignature;
      elements.actions.innerHTML = actions.slice(0, 3).map((action, index) =>
        `<button class="discoveryActionChip${action.id === activityId ? ' active' : ''}" data-discovery-action="${escapeHtml(action.id)}" type="button"><span>${escapeHtml(action.label)}</span><small>${action.id === 'fish' ? 'Full game' : index === 0 ? 'Recommended nearby lead' : 'Alternative lead'}</small></button>`
      ).join('');
    }
    const activeAction = actions.find((action) => action.id === activityId);
    const arEligibility = state.getArChallengeEligibility?.();
    if (elements.arChallenge) elements.arChallenge.hidden = !arEligibility?.allowed;
    if (elements.title && activeTab === 'today') elements.title.textContent = 'Today';
    if (elements.quickLabel) elements.quickLabel.textContent = `Resume ${activeAction?.label || 'Field Activity'}`;
    if (!snapshot) return;
    if (elements.inspection) {
      const catalog = BUILTIN_DISCOVERY_CATALOGS.fieldDiscoveries.find((entry) => entry.id === snapshot.targetCatalogId);
      const visual = visualForCatalogId(snapshot.targetCatalogId);
      const visible = !!(visual && catalog && ['revealed', 'recorded'].includes(snapshot.phase));
      elements.inspection.hidden = !visible;
      if (visible) elements.inspection.innerHTML = `<img src="${escapeHtml(visual.image)}" alt="${escapeHtml(visual.alt)}"><div class="discoveryInspectionBody"><span class="discoveryEvidence">Identification reference</span><b>${escapeHtml(catalog.names.common)}</b><em>${escapeHtml(catalog.names.scientific || visual.scientificName)}</em><p>${escapeHtml(catalog.description)}</p><a href="${escapeHtml(visual.sourceUrl)}" target="_blank" rel="noopener noreferrer">Photo: ${escapeHtml(visual.author)} · ${escapeHtml(visual.license)}</a></div>`;
    }
    if (elements.phase) elements.phase.textContent = snapshot.phase.replaceAll('-', ' ').replace(/^./, (value) => value.toUpperCase());
    const isDetector = activityId === 'metal-detect';
    if (elements.bearing) elements.bearing.textContent = isDetector
      ? snapshot.bearingDegrees == null ? 'No signal' : `${Math.round(snapshot.bearingDegrees)}° bearing`
      : snapshot.bearingDegrees == null ? snapshot.evidenceClass ? 'Virtual field record' : 'Current survey area' : `${Math.round(snapshot.bearingDegrees)}° field bearing`;
    if (elements.fill) elements.fill.style.width = `${isDetector ? Math.round(Number(snapshot.signalStrength || 0) * 100) : snapshot.phase === 'seeking' ? 18 : snapshot.phase === 'observing' ? 62 : ['revealed', 'recorded'].includes(snapshot.phase) ? 100 : 0}%`;
    if (elements.distance) elements.distance.textContent = isDetector
      ? snapshot.distanceMeters == null ? '—' : `${snapshot.distanceMeters.toFixed(1)} m`
      : snapshot.distanceMeters == null ? 'Local cell' : `${snapshot.distanceMeters.toFixed(1)} m`;
    if (elements.classification) elements.classification.textContent = snapshot.targetName || snapshot.signalClass?.replaceAll('-', ' ') || snapshot.depthBand || (isDetector ? 'Unknown' : 'Pending');
    if (elements.message) {
      elements.message.textContent = snapshot.error || snapshot.message;
      elements.message.classList.toggle('error', !!snapshot.error);
    }
    if (elements.characterAssist) {
      const assistance = snapshot.characterAssistance;
      elements.characterAssist.hidden = !assistance;
      if (assistance) {
        const detail = assistance.type === 'DetectorCharacterAssistance'
          ? `${assistance.informationTier} cues · focus ${Math.round(assistance.focusRadiusMeters)} m · reveal ${Number(assistance.excavationSeconds).toFixed(1)} s`
          : `${assistance.informationTier} cues · observation range ${Math.round(assistance.observationRadiusMeters)} m · steady range ${Math.round(assistance.steadyRangeMeters)} m`;
        elements.characterAssist.innerHTML = `<strong>${escapeHtml(assistance.label)}</strong><span>${escapeHtml(detail)}</span>`;
      }
    }
    if (elements.quickSignal) elements.quickSignal.textContent = isDetector && snapshot.signalStrength > 0.7 ? 'Strong' : isDetector && snapshot.signalStrength > 0.25 ? 'Signal' : isDetector ? 'Sweeping' : snapshot.phase === 'seeking' && snapshot.distanceMeters != null ? `${Math.ceil(snapshot.distanceMeters)} m · ${Math.round(snapshot.bearingDegrees)}°` : snapshot.phase === 'revealed' ? 'Result ready' : 'Observing';
    const detectorControls = {
      idle: ['Start Sweep', 'Close'], complete: ['Search Again', 'Close'], sweeping: ['Refine Signal', 'Close'],
      signal: ['Refine Signal', 'Close'], classified: ['Excavate', 'Leave'], excavating: ['Excavating…', 'Close'],
      revealed: ['Collect', 'Leave'], collected: ['Search Again', 'Close'], left: ['Search Again', 'Close']
    };
    const fieldControls = {
      idle: ['Begin', 'Close'], seeking: ['Locating…', 'Close'], observing: ['Observing…', 'Close'], revealed: ['Record', 'Leave'],
      recorded: ['Do Again', 'Close'], left: ['Try Again', 'Close'], complete: ['Try Again', 'Close']
    };
    const controls = (isDetector ? detectorControls : fieldControls)[snapshot.phase] || ['Begin', 'Close'];
    if (elements.primary) {
      elements.primary.textContent = controls[0];
      elements.primary.disabled = snapshot.phase === 'excavating' || snapshot.phase === 'observing' || snapshot.phase === 'seeking';
    }
    if (elements.secondary) elements.secondary.textContent = controls[1];
  }

  function showTutorial(tutorial) {
    if (!elements.tutorial) return;
    elements.tutorial.hidden = !tutorial;
    if (!tutorial) return;
    elements.tutorialTitle.textContent = `${tutorial.title} · quick guide`;
    elements.tutorialSteps.innerHTML = tutorial.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
  }

  function showSectionTutorial(tutorial) {
    if (!elements.sectionTutorial) return;
    elements.sectionTutorial.hidden = !tutorial;
    if (!tutorial) return;
    elements.sectionTutorialTitle.textContent = tutorial.title;
    elements.sectionTutorialSteps.innerHTML = tutorial.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
  }

  return Object.freeze({
    get activeTab() { return activeTab; }, get open() { return open; },
    dispose() { listeners.splice(0).forEach((remove) => remove()); setOpen(false); elements.quick?.classList.remove('show'); elements.prompt?.classList.remove('show'); },
    refreshData, render, setOpen, setTab, showResult, showSectionTutorial, showTutorial
  });
}

function playDetectorTone(state, snapshot, dt) {
  if (!['sweeping', 'signal'].includes(snapshot.phase)) return;
  state.toneTimer -= dt;
  if (state.toneTimer > 0) return;
  state.toneTimer = Math.max(0.12, 0.8 - snapshot.signalStrength * 0.65);
  try {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    state.audioContext ||= new AudioContext();
    if (state.audioContext.state === 'suspended') return;
    const oscillator = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 280 + snapshot.signalStrength * 680;
    gain.gain.setValueAtTime(0.0001, state.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, state.audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, state.audioContext.currentTime + 0.08);
    oscillator.connect(gain).connect(state.audioContext.destination);
    oscillator.start();
    oscillator.stop(state.audioContext.currentTime + 0.09);
  } catch (_) {}
}

function resumeDiscoveryAudio(state) {
  try {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return false;
    state.audioContext ||= new AudioContext();
    if (state.audioContext.state === 'suspended') void state.audioContext.resume();
    return true;
  } catch (_) {
    return false;
  }
}

function playDiscoveryCue(state, kind = 'revealed') {
  try {
    const context = state.audioContext;
    if (!context || context.state === 'suspended') return false;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(kind === 'revealed' ? 0.05 : 0.025, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32);
    gain.connect(context.destination);
    const frequencies = kind === 'revealed' ? [392, 523.25] : [310];
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = kind === 'revealed' ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.07);
      oscillator.stop(context.currentTime + 0.24 + index * 0.07);
    });
    return true;
  } catch (_) {
    return false;
  }
}

function discoveryHaptic(pattern = 18) {
  try { globalThis.navigator?.vibrate?.(pattern); } catch (_) {}
}

async function syncTrustedReceipt(appCtx, profileStore, item) {
  if (!item || appCtx.getAccountSnapshot?.().signedIn !== true) return null;
  try {
    const { claimExplorerDiscovery } = await import('../../../js/discovery-api.js?v=1');
    const receipt = await claimExplorerDiscovery({
      claimId: item.claimId,
      catalogId: item.catalogId,
      worldIdentity: item.worldIdentity,
      activityId: item.activityId || 'metal-detect',
      evidenceClass: item.evidenceClass,
      name: item.name,
      family: item.family,
      rarityBand: item.rarityBand,
      qualityBand: item.qualityBand,
      catalogVersion: BUILTIN_DISCOVERY_CATALOGS.version
    });
    const updated = await profileStore.applyTrustedReceipt?.(item.instanceId, receipt);
    appCtx.worldDiscoveryRuntime?.ui?.refreshData?.();
    return updated;
  } catch (error) {
    console.warn('[world-discovery] Trusted receipt sync deferred:', error?.message || error);
    return null;
  }
}

async function hydrateSignedInReceipts(appCtx, profileStore, claimedIds) {
  if (appCtx.getAccountSnapshot?.().signedIn !== true) return 0;
  try {
    const { listExplorerDiscoveries } = await import('../../../js/discovery-api.js?v=1');
    const response = await listExplorerDiscoveries();
    let imported = 0;
    for (const receipt of response.items || []) {
      if (!receipt?.claimId || !receipt?.catalogId) continue;
      const result = await profileStore.collect({
        instanceId: `item:${receipt.itemId || receipt.instanceId}`,
        claimId: receipt.claimId,
        catalogId: receipt.catalogId,
        name: receipt.name || receipt.catalogId,
        family: receipt.family || 'discovery',
        rarityBand: receipt.rarityBand || 'common',
        qualityBand: receipt.qualityBand || 'observed',
        discipline: 'exploration',
        activityId: receipt.activityId || 'inspect',
        regionId: receipt.worldIdentity || 'server-region',
        worldIdentity: receipt.worldIdentity || 'server-region',
        evidenceClass: receipt.evidenceClass || 'virtual-field-record',
        collectedAt: Date.now()
      });
      const instanceId = result.item?.instanceId;
      if (instanceId) await profileStore.applyTrustedReceipt?.(instanceId, receipt);
      claimedIds.add(receipt.claimId);
      if (result.collected) imported++;
    }
    return imported;
  } catch (error) {
    console.warn('[world-discovery] Signed-in receipt hydration deferred:', error?.message || error);
    return 0;
  }
}

function applyDiscoveryWorldEdit(appCtx, item, position) {
  const configs = {
    'farm-plot': { type: 'fence', materialId: 'wood', scale: { x: 5, y: 1.1, z: 1 }, heightOffset: 0.55 },
    'forest-survey': { type: 'sign', materialId: 'wood', scale: { x: 1.4, y: 1.4, z: 1 }, heightOffset: 0.8 },
    'camp-expedition': { type: 'floor', materialId: 'wood', scale: { x: 2.8, y: 1, z: 2.8 }, heightOffset: 0.08 }
  };
  const config = configs[item?.activityId];
  if (!config || typeof appCtx.placeDiscoveryWorldObject !== 'function') return null;
  return appCtx.placeDiscoveryWorldObject({
    id: `discovery:${item.claimId}`,
    catalogId: item.activityId,
    position,
    ...config
  });
}

function disposeWorldDiscoveryRuntime(appCtx, reason = 'world-reload') {
  const state = appCtx?.worldDiscoveryRuntime;
  if (!state || state.disposed) return false;
  state.disposed = true;
  state.reason = reason;
  void appCtx.closeArExperience?.(`discovery_${reason}`);
  appCtx.unregisterRuntimeOwner?.(state.owner);
  state.ui?.dispose?.();
  state.presentation?.dispose?.();
  state.companionRuntime?.dispose?.();
  if (globalThis.__WE3D_COMPANION_SUPPORT__ === state.companionSupportHook) delete globalThis.__WE3D_COMPANION_SUPPORT__;
  state.wildlifeRuntime?.dispose?.();
  state.unregisterCompanionTrainingInteraction?.();
  state.unregisterWildlifeInteraction?.();
  state.unsubscribeBackpackToolSync?.();
  state.unregisterExplorerListeners?.forEach?.((remove) => remove());
  state.audioContext?.close?.().catch?.(() => {});
  appCtx.worldDiscoveryPublicationStore?.clear?.();
  appCtx.worldDiscoveryPublication = null;
  appCtx.worldDiscoveryRuntime = null;
  appCtx.toggleWorldDiscoveryJournal = null;
  appCtx.openWorldDiscoverySection = null;
  appCtx.handleWorldDiscoveryQuickAction = null;
  appCtx.handleWorldDiscoveryToolUse = null;
  if (appCtx.recordFishingExplorerCatch === state.recordFishingExplorerCatch) appCtx.recordFishingExplorerCatch = null;
  if (appCtx.recordExplorerEvent === state.recordExplorerEvent) appCtx.recordExplorerEvent = null;
  if (appCtx.resolveCharacterCapability === state.resolveCharacterCapability) appCtx.resolveCharacterCapability = null;
  return true;
}

async function startWorldDiscoveryRuntime(appCtx, options = {}) {
  const { snapshot, request } = options;
  appCtx.disposeWorldDiscoveryRuntime = (reason) => disposeWorldDiscoveryRuntime(appCtx, reason);
  if (!appCtx || snapshot?.type !== 'WorldSnapshot' || !request?.id) return null;
  if (!globalThis.indexedDB && !appCtx.discoveryProfileStore) return null;
  if (snapshot.requestId !== request.id || appCtx.worldPublication?.sequence !== snapshot.sequence) return null;
  disposeWorldDiscoveryRuntime(appCtx, 'replacement');
  const validation = validateDiscoveryCatalogs(BUILTIN_DISCOVERY_CATALOGS);
  if (!validation.ok) throw new Error(`World Discovery catalog rejected: ${validation.errors.join('; ')}`);
  const worldIdentity = appCtx.livingWorldPublication?.worldIdentity || createStableWorldIdentity(request, {
    locationKey: request.selection?.key,
    dataProfile: 'fixed-earth-living-world-v1'
  });
  const environment = compileEnvironmentContext({
    snapshot, worldIdentity,
    buildings: appCtx.buildings, roads: appCtx.roads, landuses: appCtx.landuses,
    waterAreas: appCtx.waterAreas, waterways: appCtx.waterways,
    pointInPolygon: appCtx.pointInPolygon,
    sampleSurfaceY: (x, z) => sampleDiscoverySurfaceY(appCtx, x, z),
    localTimeBand: appCtx.timeOfDay
  });
  const eligibility = compileGeographicEligibility(environment);
  const interaction = compileWorldInteractionPublication(environment, eligibility);
  const approachEvidenceAt = (position) => {
    const surfaceY = sampleDiscoverySurfaceY(appCtx, position.x, position.z);
    if (!Number.isFinite(surfaceY)) return Object.freeze({
      stableSurface: false,
      buildingClear: false,
      barrierEvidence: 'surface-unavailable',
      accessEvidence: 'unknown',
      accessClaim: false,
      guidance: 'Choose another field stop and stay on a permitted public route.'
    });
    const collision = appCtx.checkBuildingCollision?.(position.x, position.z, 1.8, {
      actorBaseY: surfaceY,
      actorHeight: 2.1
    });
    return Object.freeze({
      stableSurface: true,
      buildingClear: collision?.collision !== true,
      barrierEvidence: collision?.collision === true
        ? 'loaded-building-volume-blocked'
        : 'generated-point-clears-loaded-building-volumes',
      accessEvidence: 'unknown',
      accessClaim: false,
      guidance: 'Stay on a permitted public route and follow local signs.'
    });
  };
  const isPositionEligible = (position) => {
    const evidence = approachEvidenceAt(position);
    return evidence.stableSurface && evidence.buildingClear;
  };
  const encounters = compileEncounterPlan(environment, eligibility, BUILTIN_DISCOVERY_CATALOGS, { isPositionEligible });
  const fieldActivities = compileFieldActivityPlan(environment, eligibility, {
    isPositionEligible,
    resolveApproachEvidence: approachEvidenceAt
  });
  const wildlife = compileAmbientWildlifePlan(environment, {
    isPositionEligible: (position) => {
      const surfaceY = sampleDiscoverySurfaceY(appCtx, position.x, position.z);
      if (!Number.isFinite(surfaceY)) return false;
      const collision = appCtx.checkBuildingCollision?.(position.x, position.z, 4.8, {
        actorBaseY: surfaceY,
        actorHeight: 2.1
      });
      return collision?.collision !== true;
    }
  });
  const publication = createDiscoveryPublication({ snapshot, environment, eligibility, interaction, encounters, fieldActivities, wildlife });
  appCtx.worldDiscoveryPublicationStore ||= createDiscoveryPublicationStore();
  const published = appCtx.worldDiscoveryPublicationStore.publish(publication, { requestId: request.id, sequence: snapshot.sequence });
  if (!published.published) return null;

  const profileStore = appCtx.discoveryProfileStore || createIndexedDbDiscoveryProfileStore();
  appCtx.discoveryProfileStore = profileStore;
  const bootstrap = typeof profileStore.loadRuntimeBootstrap === 'function'
    ? await profileStore.loadRuntimeBootstrap().catch(() => null)
    : null;
  const [existingItems, existingEvents, existingGuide, discoveryProfile] = bootstrap
    ? [bootstrap.items, bootstrap.events, bootstrap.fieldGuide, bootstrap.profile]
    : await Promise.all([
        profileStore.listItems(10000).catch(() => []),
        profileStore.listEvents?.(10000).catch(() => []) || [],
        profileStore.listFieldGuide?.(10000).catch(() => []) || [],
        profileStore.getProfile().catch(() => ({ tutorials: {} }))
      ]);
  const claimedIds = new Set([...existingItems, ...existingEvents].map((entry) => entry.claimId).filter(Boolean));
  const observedCatalogIds = new Set([...existingItems, ...existingGuide].map((entry) => entry.catalogId).filter(Boolean));
  const progress = fieldProgress(discoveryProfile);
  const initialToolProgress = explorerToolProgress(discoveryProfile);
  const entitlements = createExplorationEntitlementService({
    unlockedToolIds: initialToolProgress.unlockedToolIds,
    visibleToolIds: RELEASED_EXPLORER_TOOLS
  });
  const regionLabel = String(
    request.selection?.name ||
    request.location?.name ||
    appCtx.customLoc?.name ||
    appCtx.LOCS?.[appCtx.selLoc]?.name ||
    'Current region'
  ).trim() || 'Current region';
  const backpackInventory = appCtx.playerBackpackInventory;
  const hadFieldToolMigration = backpackInventory?.snapshot?.().items?.some((item) => item.category === 'field-tool') === true;
  const fieldToolDefinitions = TOOL_CATALOG.map(fieldToolBackpackDefinition);
  backpackInventory?.registerDefinitions?.(fieldToolDefinitions);
  for (const toolId of entitlements.listAvailableTools().map((tool) => tool.id)) {
    if (!backpackInventory?.has?.(toolId)) backpackInventory?.upsertItem?.({
      instanceId: `field-tool:${toolId}`,
      catalogId: toolId,
      quantity: 1,
      authority: 'anonymous-local',
      provenance: 'explorer-progression',
      metadata: { category: 'field-tool' }
    }, { silent: true });
  }
  projectDiscoveryItemsToBackpack(appCtx, existingItems);
  const legacyEquippedToolId = entitlements.canUseTool(discoveryProfile.equippedToolId).allowed
    ? String(discoveryProfile.equippedToolId)
    : 'field-lens';
  if (!hadFieldToolMigration) backpackInventory?.equip?.(legacyEquippedToolId);
  appCtx.playerBackpackStore?.save?.(backpackInventory?.exportState?.());
  const backpackEquipped = backpackInventory?.snapshot?.().equippedCatalogId;
  const initialEquippedToolId = entitlements.canUseTool(backpackEquipped).allowed ? backpackEquipped : legacyEquippedToolId;
  const capabilityResolver = createCapabilityResolver();
  const initialEquipmentIds = backpackEquipmentIds(appCtx, entitlements.listAvailableTools().map((tool) => tool.id));
  const initialDetectorCapability = capabilityResolver.resolve(discoveryProfile.characterState, 'detector', {
    difficulty: 'basic',
    equipmentIds: initialEquipmentIds,
    environment: appCtx.getEnv?.() || 'EARTH'
  });
  const session = createDetectorSession({
    plan: encounters, claimedIds,
    observedCatalogIds, progress,
    availableToolIds: entitlements.listAvailableTools().map((tool) => tool.id),
    characterCapability: initialDetectorCapability
  });
  const fieldSession = createFieldActivitySession({ plan: fieldActivities, claimedIds, observedCatalogIds, progress });
  const owner = `world-discovery:${snapshot.sequence}`;
  const state = {
    type: 'WorldDiscoveryRuntime', owner, appCtx, publication, environment, profileStore, entitlements, session, fieldSession,
    capabilityResolver, characterState: discoveryProfile.characterState, activeCharacterCapability: initialDetectorCapability,
    actions: [], currentCellId: null, presentation: null, ui: null,
    disposed: false, reason: null, actionTimer: 0, toneTimer: 0, audioContext: null, fieldFeedbackPhase: 'idle',
    active: true, activeActivityId: 'metal-detect', equippedToolId: initialEquippedToolId,
    toolProgress: initialToolProgress, regionLabel, worldIdentityId: worldIdentity.id,
    locationKey: String(request.selection?.key || (appCtx.selLoc !== 'custom' ? appCtx.selLoc : '') || ''),
    tutorials: { ...(discoveryProfile.tutorials || {}) },
    companionEncounters: new Map((Array.isArray(discoveryProfile.companionEncounters) ? discoveryProfile.companionEncounters : [])
      .filter((entry) => entry?.encounterId)
      .map((entry) => [String(entry.encounterId), { ...entry }])),
    companionExercise: null,
    detectorSnapshot: session.snapshot(playerPosition(appCtx)),
    lastSnapshot: session.snapshot(playerPosition(appCtx)),
    retentionSnapshot: null,
    creatureQualityAudit: auditRegionalCreatureQuality(resolveRegionalEcologyPack(worldIdentity.location))
  };
  state.resolveCharacterCapability = (capabilityId, context = {}) => state.capabilityResolver.resolve(
    state.characterState,
    capabilityId,
    {
      difficulty: 'basic',
      environment: appCtx.getEnv?.() || 'EARTH',
      equipmentIds: backpackEquipmentIds(appCtx, state.entitlements.listAvailableTools().map((tool) => tool.id)),
      ...context
    }
  );
  state.characterCapabilityForActivity = (activityId) => {
    const capabilityId = CHARACTER_CAPABILITY_BY_ACTIVITY[String(activityId || '')];
    return capabilityId ? state.resolveCharacterCapability(capabilityId) : null;
  };
  state.applyCharacterCapability = (activityId = state.activeActivityId) => {
    const capability = state.characterCapabilityForActivity(activityId);
    state.activeCharacterCapability = capability;
    if (activityId === 'metal-detect') state.session.setCharacterCapability?.(capability);
    return capability;
  };
  state.syncCharacterState = (profile) => {
    if (!profile?.characterState) return state.characterState;
    state.characterState = profile.characterState;
    state.capabilityResolver.clear();
    state.applyCharacterCapability();
    return state.characterState;
  };
  appCtx.resolveCharacterCapability = state.resolveCharacterCapability;
  state.recordExplorerEvent = async (record = {}) => {
    const position = playerPosition(appCtx);
    const result = await profileStore.recordExplorerEvent?.({
      regionId: state.worldIdentityId,
      regionLabel: state.regionLabel,
      worldIdentity: state.worldIdentityId,
      locationKey: state.locationKey,
      locationSnapshot: { ...worldIdentity.location, name: state.regionLabel },
      environment: appCtx.getEnv?.() || 'EARTH',
      localPosition: position,
      ...record
    });
    if (result?.recorded) {
      await state.refreshToolProgress?.();
      await state.ui?.refreshData?.();
    }
    return result || { recorded: false, reason: 'event-store-unavailable' };
  };
  state.saveCompanionEncounter = async (entry = {}) => {
    if (!entry.encounterId) return false;
    const normalized = {
      encounterId: String(entry.encounterId).slice(0, 180),
      actorId: String(entry.actorId || '').slice(0, 180),
      catalogId: String(entry.catalogId || '').slice(0, 80),
      worldIdentity: String(entry.worldIdentity || state.worldIdentityId).slice(0, 160),
      trustState: ['Wary', 'Curious', 'Comfortable'].includes(entry.trustState) ? entry.trustState : 'Wary',
      step: Math.max(0, Math.min(3, Math.floor(Number(entry.step) || 0))),
      completed: entry.completed === true,
      companionInstanceId: String(entry.companionInstanceId || '').slice(0, 180),
      updatedAt: Math.max(0, Number(entry.updatedAt) || Date.now())
    };
    state.companionEncounters.set(normalized.encounterId, normalized);
    const current = await profileStore.getProfile();
    const companionEncounters = [...state.companionEncounters.values()]
      .sort((left, right) => Number(left.updatedAt || 0) - Number(right.updatedAt || 0))
      .slice(-120);
    await profileStore.saveProfile({ ...current, companionEncounters });
    return normalized;
  };
  appCtx.recordExplorerEvent = state.recordExplorerEvent;
  state.unregisterExplorerListeners = [];
  const listenForExplorerEvent = (type, handler) => {
    globalThis.addEventListener?.(type, handler);
    state.unregisterExplorerListeners.push(() => globalThis.removeEventListener?.(type, handler));
  };
  listenForExplorerEvent('we3d:editable-world-change', (event) => {
    const detail = event.detail || {};
    if (!detail.worldId || !detail.action || detail.action === 'reset_world') return;
    void state.recordExplorerEvent({
      eventId: `event:creation:${detail.worldId}:${detail.revision || Date.now()}`,
      eventType: 'world-edited',
      sourceSystem: 'world-editor',
      sourceId: `${detail.worldId}:${detail.revision || ''}`,
      pathId: 'creation',
      name: 'World edit saved',
      detail: 'A change to this place was saved in the World Editor.',
      points: 0,
      progressReason: 'creative-history'
    });
  });
  listenForExplorerEvent('we3d:block-builder-change', (event) => {
    const detail = event.detail || {};
    const count = Math.max(0, Number(detail.count) || 0);
    const milestone = [1, 10, 25, 50, 100].find((target) => count === target);
    if (!milestone || detail.action !== 'place') return;
    void state.recordExplorerEvent({
      eventId: `event:block-milestone:${detail.worldId}:${milestone}`,
      eventType: 'building-milestone',
      sourceSystem: 'blocks',
      sourceId: `${detail.worldId}:${milestone}`,
      pathId: 'creation',
      name: milestone === 1 ? 'Placed the first block here' : `Built with ${milestone} blocks here`,
      detail: detail.shared ? 'A shared-world building milestone.' : 'A building milestone saved at this place.',
      firstCompletion: true,
      points: milestone === 1 ? 2 : milestone >= 25 ? 3 : 2,
      progressReason: 'building-milestone'
    });
  });
  listenForExplorerEvent('we3d:editor-feature-saved', (event) => {
    const detail = event.detail || {};
    if (!detail.featureId) return;
    const submitted = detail.reviewState === 'submitted';
    void state.recordExplorerEvent({
      eventId: `event:editor-feature:${detail.featureId}:${submitted ? 'submitted' : 'saved'}`,
      eventType: submitted ? 'creation-submitted' : 'creation-saved',
      sourceSystem: 'world-editor',
      sourceId: detail.featureId,
      pathId: 'creation',
      name: `${detail.label || 'World feature'} ${submitted ? 'submitted' : 'saved'}`,
      detail: submitted ? 'Submitted for community review.' : detail.storageMode === 'local' ? 'Saved on this device.' : 'Saved to your account.',
      firstCompletion: true,
      points: submitted ? 2 : 1,
      progressReason: submitted ? 'creation-submitted' : 'creation-saved'
    });
  });
  listenForExplorerEvent('we3d-room-changed', (event) => {
    const room = event.detail?.room;
    const roomId = String(room?.code || room?.id || '').trim();
    if (!roomId) return;
    void state.recordExplorerEvent({
      eventId: `event:room-joined:${roomId}`,
      eventType: 'room-joined',
      sourceSystem: 'multiplayer',
      sourceId: roomId,
      pathId: 'community',
      name: `Joined ${room.name || 'a shared room'}`,
      detail: 'A shared-world visit was added to your Explorer story.',
      firstCompletion: true,
      points: 1,
      progressReason: 'new-community-experience'
    });
  });
  void state.recordExplorerEvent({
    eventId: `event:place-visited:${state.worldIdentityId}`,
    eventType: 'place-visited',
    sourceSystem: 'world-travel',
    sourceId: state.worldIdentityId,
    pathId: 'travel',
    name: `Explored ${state.regionLabel}`,
    detail: 'This place is now part of your Explorer story.',
    firstCompletion: true,
    points: 1,
    progressReason: 'new-place-visited'
  });
  state.evaluateFieldTarget = (target, evidence = null) => {
    const liveGps = appCtx.getLiveGpsSnapshot?.() || { active: false };
    return liveGps.active ? appCtx.getLiveGpsFieldEligibility?.(target, evidence || approachEvidenceAt(target)) || null : null;
  };
  state.fieldExpedition = createFieldExpedition({
    plan: fieldActivities,
    claimedIds,
    observedCatalogIds,
    progress,
    position: playerPosition(appCtx),
    isSlotAvailable: (slot) => {
      const toolId = ACTIVITY_TOOL[slot.activityId];
      return RELEASED_EXPLORER_ACTIVITIES.has(slot.activityId) && (!toolId || entitlements.canUseTool(toolId).allowed);
    }
  });
  state.encounterDirector = createWalkingEncounterDirector({
    plan: fieldActivities,
    claimedIds,
    canUseSlot: (slot) => {
      const toolId = ACTIVITY_TOOL[slot.activityId];
      return RELEASED_EXPLORER_ACTIVITIES.has(slot.activityId) &&
        slotAvailableAtProgress(slot, state.fieldSession.snapshot().fieldProgress) &&
        (!toolId || state.entitlements.canUseTool(toolId).allowed);
    }
  });
  state.encounterLead = state.encounterDirector.snapshot(playerPosition(appCtx), false);
  state.recordFishingExplorerCatch = async (catchRecord = {}) => {
    if (!catchRecord.id || !catchRecord.speciesId) return false;
    const position = playerPosition(appCtx);
    const regionalPack = resolveRegionalEcologyPack(worldIdentity.location);
    const regionalTaxon = regionalPack?.taxa?.find((entry) =>
      entry.group.endsWith('-fish') &&
      String(entry.localizedNames?.['en-US'] || '').toLowerCase() === String(catchRecord.species || '').toLowerCase()
    ) || null;
    const result = await profileStore.recordObservation({
      instanceId: `fish-catch:${catchRecord.id}`,
      claimId: `claim:fishing:${catchRecord.id}`,
      catalogId: regionalTaxon?.id || catchRecord.speciesId,
      name: catchRecord.species || catchRecord.speciesId,
      description: 'Virtual fishing catch recorded through the shared Explorer Journal.',
      family: 'fish',
      rarityBand: catchRecord.rarity || 'common',
      qualityBand: 'virtual-catch',
      discipline: 'nature',
      activityId: 'fish',
      toolId: 'fishing-rod',
      regionId: worldIdentity.id,
      regionLabel,
      locationKey: state.locationKey,
      locationSnapshot: { ...worldIdentity.location, name: state.regionLabel },
      worldIdentity: worldIdentity.id,
      environment: appCtx.getEnv?.() || 'EARTH',
      localPosition: position,
      evidenceClass: 'virtual-fishing-catch',
      evidenceContractId: 'virtual-fishing-catch',
      evidencePayload: {
        fishingAuthorityVersion: catchRecord.fishingAuthorityVersion || '',
        populationContextId: catchRecord.populationContextId || '',
        populationEvidence: catchRecord.populationEvidence || 'gameplay-model-only',
        waterbodyId: catchRecord.waterbodyId || '',
        waterKind: catchRecord.waterKind || '',
        waterClass: catchRecord.waterClass || 'unresolved',
        waterSourceTruth: catchRecord.waterSourceTruth || 'unresolved',
        depthTruth: catchRecord.depthTruth || 'unavailable',
        accessMode: catchRecord.accessMode || '',
        accessTruth: catchRecord.accessTruth || 'unknown-access',
        bankEvidence: catchRecord.bankEvidence || null,
        locationPrecision: catchRecord.locationPrecision || 'not-recorded',
        livePresenceClaim: false,
        locationRewardEligible: catchRecord.locationRewardEligible === true
      },
      regionalPackId: regionalTaxon ? regionalPack.id : null,
      regionalPackVersion: regionalTaxon ? regionalPack.version : null,
      stableTaxonId: regionalTaxon?.stableTaxonId || `we3d-game-fish:${catchRecord.speciesId}`,
      taxonGroup: regionalTaxon?.group || 'fish',
      supportingEvidence: [
        catchRecord.occurrenceTruth || 'simulated-gameplay-event',
        catchRecord.populationEvidence || 'gameplay-model-only',
        catchRecord.accessTruth || 'unknown-access'
      ],
      sourceRefs: regionalTaxon?.sourceRefs || [],
      collectedAt: Date.now()
    }, { collection: true });
    if (!result.recorded && !result.collected) return false;
    await state.refreshToolProgress?.();
    await state.ui?.refreshData?.();
    return true;
  };
  appCtx.recordFishingExplorerCatch = state.recordFishingExplorerCatch;
  state.presentation = createFieldEquipmentPresentation(appCtx);
  state.companionRuntime = await createCompanionRuntime(appCtx, {
    profileStore,
    worldIdentity: worldIdentity.id,
    onChange: () => state.ui?.refreshData?.(),
    onXpAward: (companion, award) => {
      appCtx.showToast?.(`+${award.points} Companion XP · ${award.label}`);
      emitDiscoveryTelemetry('companion_xp_awarded', { result: award.companion?.progression?.lastAward?.reasonId || 'shared-activity', contextBands: telemetryContextBands() });
    },
    onTrainingComplete: (companion, skill) => {
      if (skill !== 'recall') return;
      appCtx.showToast?.(`${companion.name} learned Recall.`);
      emitDiscoveryTelemetry('companion_training_completed', { result: 'recall', contextBands: telemetryContextBands() });
      void state.recordExplorerEvent({
        eventId: `event:companion:training:${companion.instanceId}:recall`,
        eventType: 'companion-training', sourceSystem: 'companions',
        sourceId: companion.instanceId, pathId: 'companion',
        name: `${companion.name} learned Recall`,
        detail: 'The first recall exercise was completed in the world.',
        firstCompletion: true, points: 0, progressReason: 'companion-memory'
      });
    },
    onLevelUp: (companion, previousLevel) => {
      const milestone = [3, 8, 12].includes(companion.progression.level);
      appCtx.showToast?.(`${companion.name} reached level ${companion.progression.level} · ${companion.progression.trustState}`);
      emitDiscoveryTelemetry('companion_level_reached', { result: `level-${companion.progression.level}`, contextBands: telemetryContextBands() });
      if (!milestone) return;
      void state.recordExplorerEvent({
        eventId: `event:companion:level:${companion.instanceId}:${companion.progression.level}`,
        eventType: 'companion-level',
        sourceSystem: 'companions',
        sourceId: companion.instanceId,
        pathId: 'companion',
        name: `${companion.name} reached level ${companion.progression.level}`,
        detail: companion.progression.level === 3
          ? 'Recall training built a trusting partnership.'
          : companion.progression.level === 8 ? 'Field training built a bonded partnership.' : 'Companion mastery completed.',
        firstCompletion: true,
        points: 1,
        progressReason: 'companion-bond-milestone',
        metadata: { previousLevel, level: companion.progression.level }
      });
    }
  });
  if (appCtx.developerDiagnosticsEnabled) {
    state.companionSupportHook = Object.freeze({
      adopt: (catalogId, options = {}) => state.companionRuntime.adopt(catalogId, options),
      awardXp: (receiptId, reasonId) => state.companionRuntime.awardXp({ receiptId, reasonId }),
      encounters: () => Object.freeze([...state.companionEncounters.values()].map((entry) => Object.freeze({ ...entry }))),
      encounterExercise: () => state.companionExercise ? Object.freeze({
        type: state.companionExercise.type,
        actorId: state.companionExercise.actorId,
        catalogId: state.companionExercise.catalogId,
        elapsedMs: Math.max(0, performance.now() - state.companionExercise.startedAt),
        completing: state.companionExercise.completing === true
      }) : null,
      worldActors: () => Object.freeze((state.publication.wildlife?.actors || []).map((actor) => Object.freeze({
        id: actor.id, speciesId: actor.speciesId, companionPolicy: actor.companionPolicy, home: actor.home
      }))),
      snapshot: () => state.companionRuntime.snapshot()
    });
    globalThis.__WE3D_COMPANION_SUPPORT__ = state.companionSupportHook;
  }
  state.awardActiveCompanionForField = async (receiptBase, firstIdentification = false) => {
    const stable = String(receiptBase || '').trim();
    if (!stable || !state.companionRuntime.snapshot().activeInstanceId) return false;
    const fieldAward = await state.companionRuntime.awardXp({ receiptId: `field:${stable}`, reasonId: 'field-activity' });
    if (firstIdentification) {
      await state.companionRuntime.awardXp({ receiptId: `species:${stable}`, reasonId: 'new-species' });
    }
    return fieldAward;
  };
  state.wildlifeRuntime = createAmbientWildlifeRuntime(appCtx, wildlife);
  state.refreshToolProgress = async () => {
    const profile = await profileStore.getProfile();
    state.syncCharacterState(profile);
    const previous = new Set(state.toolProgress?.unlockedToolIds || []);
    state.toolProgress = explorerToolProgress(profile);
    state.entitlements = createExplorationEntitlementService({
      unlockedToolIds: state.toolProgress.unlockedToolIds,
      visibleToolIds: RELEASED_EXPLORER_TOOLS
    });
    state.entitlements.listAvailableTools().forEach((tool) => {
      appCtx.playerBackpackInventory?.upsertItem?.({
        instanceId: `field-tool:${tool.id}`,
        catalogId: tool.id,
        quantity: 1,
        authority: 'anonymous-local',
        provenance: 'explorer-progression',
        metadata: { category: 'field-tool' }
      }, { silent: true });
    });
    appCtx.playerBackpackStore?.save?.(appCtx.playerBackpackInventory?.exportState?.());
    state.session.setAvailableToolIds?.(state.entitlements.listAvailableTools().map((tool) => tool.id));
    state.applyCharacterCapability();
    const unlocked = state.toolProgress.unlockedToolIds.filter((toolId) => !previous.has(toolId));
    if (unlocked.length) {
      const labels = state.entitlements.listAvailableTools().filter((tool) => unlocked.includes(tool.id)).map((tool) => tool.label);
      appCtx.showToast?.(`Explorer capability unlocked: ${labels.join(', ')}`);
    }
    return state.toolProgress;
  };
  state.activeTutorialId = '';
  state.presentTutorial = (tutorial, force = false) => {
    if (!tutorial || (!force && state.tutorials[tutorial.id])) {
      if (tutorial?.section) state.ui?.showSectionTutorial(null);
      else state.ui?.showTutorial(null);
      return false;
    }
    state.activeTutorialId = tutorial.id;
    if (tutorial.section) state.ui?.showSectionTutorial(tutorial);
    else state.ui?.showTutorial(tutorial);
    return true;
  };
  state.showSectionTutorial = async (sectionId, force = false) => {
    const tutorial = EXPLORER_SECTION_TUTORIALS[sectionId];
    return state.presentTutorial(tutorial ? { ...tutorial, section: true } : null, force);
  };
  state.showActivityTutorial = async (force = false) => {
    const tutorial = tutorialForActivity(state.activeActivityId, BUILTIN_DISCOVERY_CATALOGS);
    return state.presentTutorial(tutorial, force);
  };
  state.dismissActivityTutorial = async () => {
    state.ui?.showTutorial(null);
    state.ui?.showSectionTutorial(null);
    const tutorialId = state.activeTutorialId || tutorialForActivity(state.activeActivityId, BUILTIN_DISCOVERY_CATALOGS)?.id;
    state.activeTutorialId = '';
    if (!tutorialId || state.tutorials[tutorialId]) return true;
    state.tutorials[tutorialId] = true;
    const profile = await profileStore.getProfile();
    await profileStore.saveProfile({ ...profile, tutorials: { ...profile.tutorials, [tutorialId]: true } });
    return true;
  };
  state.equipTool = async (toolId, options = {}) => {
    const id = String(toolId || 'field-lens');
    const tool = state.entitlements.listAvailableTools().find((entry) => entry.id === id);
    if (!tool || state.entitlements.canUseTool(id).allowed !== true) return false;
    if (appCtx.playerBackpackInventory?.equip?.(id) !== true) return false;
    appCtx.playerBackpackStore?.save?.(appCtx.playerBackpackInventory.exportState?.());
    state.equippedToolId = id;
    state.applyCharacterCapability();
    if (!options.silent) appCtx.showToast?.(`${tool.label} equipped`);
    await state.ui?.refreshData?.();
    return true;
  };
  state.unsubscribeBackpackToolSync = appCtx.playerBackpackInventory?.subscribe?.((change) => {
    if (change?.reason !== 'equipped-changed') return;
    const equippedId = appCtx.playerBackpackInventory?.snapshot?.().equippedCatalogId;
    if (!equippedId || state.entitlements.canUseTool(equippedId).allowed !== true || equippedId === state.equippedToolId) return;
    state.equippedToolId = equippedId;
    state.applyCharacterCapability();
    void profileStore.getProfile().then((profile) => profileStore.saveProfile({ ...profile, equippedToolId: equippedId }));
    void state.ui?.refreshData?.();
  });
  state.showToolHelp = async (toolId) => {
    const tool = state.entitlements.listAvailableTools().find((entry) => entry.id === String(toolId));
    if (!tool) return false;
    state.ui?.setTab('today');
    state.presentTutorial({
      id: `tool-help:${tool.id}`,
      title: tool.label,
      steps: [
        'Equip this tool from your Backpack. Compatible nearby leads will also equip it automatically.',
        `Use it for ${tool.capabilities.map((value) => displayDiscoveryLabel(value)).join(', ')}.`,
        'Begin the activity, minimize the Journal, and follow the world-space direction or signal.',
        'Return to record the result. The result card names every place where it was saved.'
      ]
    }, true);
    return true;
  };
  state.returnToJournalEvent = async (eventId) => {
    const events = await profileStore.listEvents?.(500) || [];
    const event = events.find((entry) => entry.eventId === String(eventId));
    const locationKey = String(event?.locationKey || '');
    if (!event) return false;
    const savedLocation = event.locationSnapshot || {};
    const isPreset = !!(locationKey && appCtx.LOCS?.[locationKey] && typeof appCtx.selectPresetLocation === 'function');
    const isCoordinate = Number.isFinite(savedLocation.lat) && Number.isFinite(savedLocation.lon) && typeof appCtx.setCustomLocation === 'function';
    if (!isPreset && !isCoordinate) return false;
    state.ui?.setOpen(false);
    if (isPreset && String(appCtx.selLoc) === locationKey) {
      appCtx.showToast?.(`Already exploring ${event.regionLabel || 'this location'}`);
      return true;
    }
    if (isPreset) appCtx.selectPresetLocation(locationKey);
    else appCtx.setCustomLocation({ lat: savedLocation.lat, lon: savedLocation.lon, name: savedLocation.name || event.regionLabel || 'Saved place' }, { transient: false });
    if (appCtx.ENV?.EARTH && appCtx.getEnv?.() !== appCtx.ENV.EARTH) appCtx.switchEnv?.(appCtx.ENV.EARTH);
    await appCtx.loadRoads?.();
    appCtx.spawnOnRoad?.();
    appCtx.showToast?.(`Returned to ${event.regionLabel || appCtx.LOCS?.[locationKey]?.name || savedLocation.name || 'saved place'}`);
    return true;
  };
  const telemetryContextBands = () => environment.cells.find((cell) => cell.cellId === state.currentCellId)?.contexts || [];
  state.isCompanionEligible = (catalog) => catalog?.contexts?.some((context) => telemetryContextBands().includes(context)) === true;
  state.hasWorldCompanionEncounter = (catalogId) => wildlife.actors.some((actor) =>
    actor.speciesId === String(catalogId) || WILDLIFE_COMPANION_CATALOG[actor.speciesId] === String(catalogId)
  );
  state.companionEncounterState = (catalogId, actorId = '') => {
    const matches = [...state.companionEncounters.values()].filter((entry) =>
      entry.catalogId === String(catalogId) &&
      entry.worldIdentity === state.worldIdentityId &&
      (!actorId || entry.actorId === String(actorId)) &&
      entry.completed !== true
    );
    return matches.sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0]
      || { step: 0, trustState: 'Wary', actorId: String(actorId || '') };
  };
  state.getArChallengeEligibility = () => evaluateArEligibility({ type: 'field-challenge' }, {
    environmentName: appCtx.getEnv?.() || 'EARTH',
    environment,
    position: playerPosition(appCtx),
    travelMode: appCtx.Walk?.state?.mode === 'walk' ? appCtx.urbanSandboxRuntime?.parachute?.skydiving ? 'skydive' : 'walk' : appCtx.boatMode?.active ? 'boat' : appCtx.droneMode ? 'drone' : appCtx.planeMode?.active ? 'plane' : 'car',
    liveGpsSnapshot: appCtx.getLiveGpsSnapshot?.() || { active: false }
  });
  state.handleArRecord = async (recordId, source = 'field-guide') => {
    const records = source === 'collection'
      ? await profileStore.listItems(200)
      : await profileStore.listFieldGuide(500);
    const record = records.find((entry) => String(entry.instanceId || entry.catalogId) === String(recordId));
    if (!record) return false;
    const catalog = BUILTIN_DISCOVERY_CATALOGS.fieldDiscoveries.find((entry) => entry.id === record.catalogId);
    state.ui?.setOpen(false);
    return appCtx.openArExperience?.({
      type: 'specimen',
      record: { ...record, name: record.name || catalog?.names?.common || record.catalogId }
    });
  };
  state.handleArChallenge = async () => {
    const eligibility = state.getArChallengeEligibility();
    if (!eligibility.allowed) return false;
    const activeCompanion = state.companionRuntime.snapshot().companions.find((entry) => entry.active) || null;
    state.ui?.setOpen(false);
    return appCtx.openArExperience?.({
      type: 'field-challenge',
      challengeId: 'waterfowl-photo-v1',
      cellId: eligibility.cellId,
      habitat: eligibility.habitat,
      companion: activeCompanion?.catalogId === 'trail-hound' ? activeCompanion : null
    });
  };
  state.handleCompanionAction = async (action, instanceId, catalogId, requestedName = '') => {
    if (action === 'locate') {
      const catalog = COMPANION_CATALOG.find((entry) => entry.id === String(catalogId));
      if (!catalog || !state.isCompanionEligible(catalog)) return false;
      state.ui?.setOpen(false);
      appCtx.showToast?.(`Find ${catalog.names.common} in the world and use the nearby Action prompt.`);
      return true;
    }
    else if (action === 'ar') {
      const companion = state.companionRuntime.snapshot().companions.find((entry) => entry.instanceId === String(instanceId));
      if (!companion) return false;
      state.ui?.setOpen(false);
      return appCtx.openArExperience?.({ type: 'companion', companion });
    }
    else if (action === 'befriend') {
      const catalog = COMPANION_CATALOG.find((entry) => entry.id === String(catalogId));
      const encounter = state.companionEncounterState(catalogId);
      if (!catalog || encounter.trustState !== 'Comfortable' || !encounter.encounterId) return false;
      const before = state.companionRuntime.snapshot().companions.length;
      await state.companionRuntime.adopt(catalog.id, { name: requestedName, discoveryId: encounter.encounterId });
      const companion = state.companionRuntime.snapshot().companions.find((entry) => entry.active);
      if (!companion) return false;
      await state.saveCompanionEncounter({ ...encounter, completed: true, companionInstanceId: companion.instanceId });
      state.wildlifeRuntime?.interact?.(encounter.actorId, 'adopted');
      await profileStore.recordObservation({
        claimId: `companion-species:${catalog.id}`,
        catalogId: catalog.id,
        name: catalog.names.common,
        family: catalog.family,
        discipline: 'nature',
        activityId: 'nature-observe',
        evidenceClass: 'game-companion-encounter',
        sourceRefs: catalog.sourceRefs,
        regionId: state.worldIdentityId,
        regionLabel: state.regionLabel,
        worldIdentity: state.worldIdentityId,
        locationKey: state.locationKey,
        locationSnapshot: { ...worldIdentity.location, name: state.regionLabel },
        environment: appCtx.getEnv?.() || 'EARTH',
        localPosition: playerPosition(appCtx),
        collectedAt: Date.now()
      });
      void state.recordExplorerEvent({
        eventId: `event:companion:befriended:${companion.instanceId}`,
        eventType: 'companion-befriended',
        sourceSystem: 'companions', sourceId: companion.instanceId, pathId: 'companion',
        name: `${companion.name} joined the journey`,
        detail: `${catalog.names.common} became an active companion.`,
        firstCompletion: true,
        points: before === 0 ? 1 : 0,
        progressReason: before === 0 ? 'first-companion' : 'companion-memory'
      });
      emitDiscoveryTelemetry('companion_adopted', { result: 'befriended', contextBands: telemetryContextBands() });
      appCtx.showToast?.(`${companion.name} joined you.`);
    }
    else if (action === 'activate') await state.companionRuntime.setActive(instanceId);
    else if (action === 'care') {
      const companion = state.companionRuntime.snapshot().companions.find((entry) => entry.instanceId === String(instanceId));
      if (!companion) return false;
      await state.companionRuntime.care(instanceId, companion.speciesArchetype === 'bird' ? 'groom' : 'pet');
      const day = new Date().toISOString().slice(0, 10);
      if (companion.progression?.totalXp > 0) {
        await state.companionRuntime.awardXp({ receiptId: `care:${companion.instanceId}:${day}`, reasonId: 'care-after-outing' });
      }
      appCtx.showToast?.(`${companion.name} enjoyed the attention.`);
    }
    else if (action === 'recall-training') {
      if (!state.companionRuntime.beginRecallExercise(instanceId, playerPosition(appCtx))) return false;
      state.ui?.setOpen(false);
      appCtx.showToast?.('Walk at least 6 m away, then call your companion.');
      emitDiscoveryTelemetry('companion_training_started', { result: 'recall', contextBands: telemetryContextBands() });
      return true;
    }
    const companion = state.companionRuntime.snapshot().companions.find((entry) => entry.instanceId === String(instanceId));
    emitDiscoveryTelemetry(
      action === 'activate' ? 'companion_activated' : 'companion_cared_for',
      { result: action, contextBands: telemetryContextBands() }
    );
    await state.ui.refreshData();
    return true;
  };
  state.handleWorldWildlifeInteraction = async (candidate) => {
    const actorId = String(candidate?.data?.actorId || '');
    const speciesId = String(candidate?.data?.speciesId || '');
    const companionPolicy = String(candidate?.data?.companionPolicy || 'observe-only');
    if (!actorId || !speciesId) return false;
    if (companionPolicy === 'trust-sequence-required') {
      const catalog = COMPANION_CATALOG.find((entry) => entry.id === speciesId);
      if (!catalog || !FIRST_RELEASE_COMPANION_IDS.has(catalog.id)) return false;
      const current = state.companionEncounterState(catalog.id, actorId);
      const encounterId = current.encounterId || `encounter:${state.worldIdentityId}:${actorId}`;
      if (current.step === 0) {
        await state.saveCompanionEncounter({
          ...current, encounterId, actorId, catalogId: catalog.id,
          worldIdentity: state.worldIdentityId, step: 1, trustState: 'Curious'
        });
        state.wildlifeRuntime?.interact?.(actorId, 'watch');
        emitDiscoveryTelemetry('companion_trust_advanced', { result: 'curious', contextBands: telemetryContextBands() });
        appCtx.showToast?.(`${catalog.names.common} is watching you. Stay nearby and let it approach.`);
      } else if (current.step === 1) {
        if (state.companionExercise?.type === 'calm-wait') return true;
        const startPosition = playerPosition(appCtx);
        state.companionExercise = {
          type: 'calm-wait', encounterId, actorId, catalogId: catalog.id,
          startedAt: performance.now(), startPosition: { x: startPosition.x, z: startPosition.z }, completing: false
        };
        state.wildlifeRuntime?.interact?.(actorId, 'wait');
        const handling = companionHandlingTuning(state.resolveCharacterCapability('companion-handling'));
        appCtx.showToast?.('Stay still and let it choose the distance.');
        await new Promise((resolve) => setTimeout(resolve, handling.calmWaitMs));
        state.companionExercise = null;
        if (state.disposed) return false;
        await state.saveCompanionEncounter({
          ...current, encounterId, actorId, catalogId: catalog.id,
          worldIdentity: state.worldIdentityId, step: 2, trustState: 'Curious'
        });
        appCtx.showToast?.('It came closer. You can greet it now.');
      } else if (current.step === 2) {
        await state.saveCompanionEncounter({ ...current, step: 3, trustState: 'Comfortable' });
        state.wildlifeRuntime?.interact?.(actorId, 'greet');
        emitDiscoveryTelemetry('companion_trust_advanced', { result: 'comfortable', contextBands: telemetryContextBands() });
        appCtx.showToast?.(`Comfortable · you can greet and name ${catalog.names.common}.`);
        state.ui?.setOpen(true);
        state.ui?.setTab('gear');
      } else {
        state.ui?.setOpen(true);
        state.ui?.setTab('gear');
      }
      await state.ui?.refreshData?.();
      return true;
    }

    const observationCatalogId = WILDLIFE_OBSERVATION_CATALOG[speciesId];
    const catalog = BUILTIN_DISCOVERY_CATALOGS.fieldDiscoveries.find((entry) => entry.id === observationCatalogId);
    if (!catalog) return false;
    const position = {
      x: Number(candidate?.data?.x || playerPosition(appCtx).x),
      y: Number(candidate?.data?.y || playerPosition(appCtx).y),
      z: Number(candidate?.data?.z || playerPosition(appCtx).z)
    };
    state.wildlifeRuntime?.interact?.(actorId, 'observed');
    const recorded = await profileStore.recordObservation({
      claimId: `wildlife:${state.worldIdentityId}:${actorId}:${catalog.id}`,
      catalogId: catalog.id,
      name: catalog.names?.common || catalog.id,
      family: catalog.family,
      discipline: 'nature',
      activityId: 'photograph',
      toolId: 'field-camera',
      evidenceClass: 'virtual-wildlife-record',
      sourceRefs: catalog.sourceRefs,
      regionId: state.worldIdentityId,
      regionLabel: state.regionLabel,
      worldIdentity: state.worldIdentityId,
      locationKey: state.locationKey,
      locationSnapshot: { ...worldIdentity.location, name: state.regionLabel },
      environment: appCtx.getEnv?.() || 'EARTH',
      localPosition: position,
      collectedAt: Date.now()
    });
    if (recorded.recorded) {
      await state.refreshToolProgress();
      await state.awardActiveCompanionForField?.(
        recorded.event?.eventId || `wildlife:${state.worldIdentityId}:${actorId}:${catalog.id}`,
        recorded.event?.firstIdentification === true
      );
      appCtx.showToast?.(`${catalog.names.common} recorded in your Field Guide.`);
      emitDiscoveryTelemetry('discovery_recorded', { activityId: 'photograph', catalogFamily: catalog.family, discipline: 'nature', contextBands: telemetryContextBands(), result: 'recorded-in-world' });
    } else {
      appCtx.showToast?.(`${catalog.names.common} is already in your Field Guide.`);
    }

    const companionCatalogId = WILDLIFE_COMPANION_CATALOG[speciesId];
    if (companionCatalogId) {
      const encounter = state.companionEncounterState(companionCatalogId, actorId);
      if (encounter.step === 0) {
        await state.saveCompanionEncounter({
          ...encounter,
          encounterId: `encounter:${state.worldIdentityId}:${actorId}`,
          actorId,
          catalogId: companionCatalogId,
          worldIdentity: state.worldIdentityId,
          step: 1,
          trustState: 'Curious'
        });
      }
    }
    await state.ui?.refreshData?.();
    return true;
  };
  state.selectActivity = async (activityId, options = {}) => {
    const id = String(activityId || 'inspect');
    const selectedAction = state.actions.find((action) => action.id === id);
    const activityToolId = ACTIVITY_TOOL[id];
    if (activityToolId && !state.entitlements.canUseTool(activityToolId).allowed) {
      appCtx.showToast?.(`${displayDiscoveryLabel(activityToolId)} unlocks at a later Explorer rank.`);
      return false;
    }
    emitDiscoveryTelemetry('activity_started', {
      activityId: id,
      discipline: selectedAction?.discipline,
      contextBands: telemetryContextBands(),
      liveGps: appCtx.liveGpsActive === true
    });
    if (id === 'fish') {
      await appCtx.openFishingGame?.();
      return true;
    }
    // Commit the visible selection before any IndexedDB/profile refresh. The
    // previous ordering left the old activity highlighted during the await,
    // so a single click could visibly bounce old → new several times.
    const previousActivityId = state.activeActivityId;
    state.activeActivityId = id;
    state.applyCharacterCapability(id);
    state.ui.render(state.actions, state.lastSnapshot, state.activeActivityId);
    if (activityToolId && await state.equipTool(activityToolId, { silent: true }) !== true) {
      state.activeActivityId = previousActivityId;
      state.applyCharacterCapability(previousActivityId);
      state.ui.render(state.actions, state.lastSnapshot, state.activeActivityId);
      return false;
    }
    if (id === 'metal-detect') {
      state.fieldSession.reset();
      state.lastSnapshot = state.detectorSnapshot;
    } else {
      state.session.reset();
      state.detectorSnapshot = state.session.snapshot(playerPosition(appCtx));
      state.fieldSession.reset();
      state.lastSnapshot = state.fieldSession.snapshot(playerPosition(appCtx));
    }
    state.presentation.setRevealed(null, false);
    state.presentation.setExcavation(null, 'idle');
    state.ui.showResult(null);
    state.ui.setOpen(options.openPanel === false ? false : true);
    if (options.openPanel !== false) state.ui.setTab('today');
    state.ui.render(state.actions, state.lastSnapshot, state.activeActivityId);
    if (options.tutorial !== false) void state.showActivityTutorial(false);
    return true;
  };
  state.useEquippedFieldTool = async (toolId) => {
    const id = String(toolId || '');
    state.presentation.previewUse?.(id);
    const action = state.actions.find((entry) => ACTIVITY_TOOL[entry.id] === id);
    if (!action) return false;
    const selected = await state.selectActivity(action.id, { openPanel: false, tutorial: false });
    if (!selected) return false;
    return state.handlePrimary();
  };
  state.startFieldObjective = async (slotId) => {
    const objective = state.fieldExpedition.snapshot(playerPosition(appCtx), state.evaluateFieldTarget)
      .objectives.find((entry) => entry.slotId === slotId && !entry.complete);
    if (!objective) return false;
    const activityId = objective.activityId;
    const toolId = ACTIVITY_TOOL[activityId];
    if (toolId && !state.entitlements.canUseTool(toolId).allowed) {
      appCtx.showToast?.(`${displayDiscoveryLabel(toolId)} unlocks at a later Explorer rank.`);
      return false;
    }
    if (toolId) await state.equipTool(toolId, { silent: true });
    state.activeActivityId = activityId;
    const characterCapability = state.applyCharacterCapability(activityId);
    state.session.reset();
    state.detectorSnapshot = state.session.snapshot(playerPosition(appCtx));
    state.fieldSession.reset();
    const began = state.fieldSession.beginSlot(slotId, playerPosition(appCtx), {
      evaluateFieldTarget: state.evaluateFieldTarget,
      characterCapability
    });
    state.lastSnapshot = state.fieldSession.snapshot(playerPosition(appCtx));
    state.ui.showResult(null);
    state.ui.setTab('today');
    state.ui.render(state.actions, state.lastSnapshot, state.activeActivityId);
    if (began) {
      state.ui.setOpen(false);
      emitDiscoveryTelemetry('activity_started', {
        activityId,
        discipline: state.actions.find((action) => action.id === activityId)?.discipline,
        contextBands: telemetryContextBands(),
        liveGps: appCtx.liveGpsActive === true,
        result: 'today-route'
      });
    }
    return began;
  };
  state.startEncounterLead = async () => {
    const position = playerPosition(appCtx);
    const liveGps = appCtx.getLiveGpsSnapshot?.() || { active: false };
    const lead = state.encounterDirector.snapshot(position, liveGps.active === true);
    if (!lead.available || !lead.slotId || !lead.activityId) return false;
    const toolId = ACTIVITY_TOOL[lead.activityId];
    if (toolId && !state.entitlements.canUseTool(toolId).allowed) {
      state.encounterDirector.reject(lead.slotId);
      appCtx.showToast?.(`${displayDiscoveryLabel(toolId)} unlocks at a later Explorer rank.`);
      return false;
    }
    if (toolId) await state.equipTool(toolId, { silent: true });
    state.activeActivityId = lead.activityId;
    const characterCapability = state.applyCharacterCapability(lead.activityId);
    state.session.reset();
    state.detectorSnapshot = state.session.snapshot(position);
    state.fieldSession.reset();
    const began = state.fieldSession.beginSlot(lead.slotId, position, {
      evaluateFieldTarget: state.evaluateFieldTarget,
      characterCapability
    });
    if (!began) {
      state.encounterDirector.reject(lead.slotId);
      state.encounterLead = state.encounterDirector.snapshot(position, liveGps.active === true);
      appCtx.showToast?.('That lead is no longer available. Keep walking for another encounter.');
      return false;
    }
    state.encounterDirector.accept(position, liveGps.active === true);
    state.encounterLead = state.encounterDirector.snapshot(position, liveGps.active === true);
    state.lastSnapshot = state.fieldSession.snapshot(position);
    state.ui.showResult(null);
    state.ui.setTab('today');
    state.ui.setOpen(false);
    state.ui.render(state.actions, state.lastSnapshot, state.activeActivityId);
    discoveryHaptic([12, 24, 12]);
    appCtx.showToast?.(`${lead.leadLabel} tracked · follow the field bearing.`);
    // Use the canonical field-activity event so onboarding, analytics, and all
    // activity entry points observe the same lifecycle.
    emitDiscoveryTelemetry('activity_started', {
      activityId: lead.activityId,
      discipline: lead.tone === 'nature' ? 'nature' : lead.tone === 'earth' ? 'earth-science' : 'exploration',
      contextBands: telemetryContextBands(),
      liveGps: liveGps.active === true,
      result: 'walking-encounter'
    });
    return true;
  };
  state.handlePrimary = async () => {
    resumeDiscoveryAudio(state);
    const position = playerPosition(appCtx);
    if (state.activeActivityId !== 'metal-detect') {
      const fieldPhase = state.fieldSession.snapshot().phase;
      if (['idle', 'complete', 'recorded', 'left'].includes(fieldPhase)) {
        state.fieldSession.reset();
        const began = state.fieldSession.begin(state.activeActivityId, environment, position, {
          evaluateFieldTarget: state.evaluateFieldTarget,
          preferNearby: (appCtx.getLiveGpsSnapshot?.() || {}).active === true,
          characterCapability: state.applyCharacterCapability(state.activeActivityId)
        });
        if (began) state.ui.setOpen(false);
      } else if (fieldPhase === 'revealed') {
        const completedSlot = fieldActivities.slots.find((entry) => entry.id === state.fieldSession.snapshot(position).targetId);
        const recorded = await state.fieldSession.record(profileStore, {
          toolId: ACTIVITY_TOOL[state.activeActivityId] || '',
          regionLabel,
          locationKey: state.locationKey,
          locationSnapshot: { ...worldIdentity.location, name: state.regionLabel },
          environment: appCtx.getEnv?.() || 'EARTH',
          localPosition: position,
          evaluateFieldTarget: state.evaluateFieldTarget
        });
        if (recorded && completedSlot) state.fieldExpedition.markComplete(completedSlot.claimId);
        if (recorded) await state.refreshToolProgress();
        await state.ui.refreshData();
        const outcome = state.fieldSession.snapshot().collectionResult;
        const instanceId = outcome?.instanceId;
        const item = (await profileStore.listItems(200)).find((entry) => entry.instanceId === instanceId);
        const resultRecord = item || outcome?.event || null;
        applyDiscoveryWorldEdit(appCtx, resultRecord, position);
        void syncTrustedReceipt(appCtx, profileStore, item);
        if (recorded) emitDiscoveryTelemetry('discovery_recorded', {
          activityId: state.activeActivityId,
          catalogFamily: resultRecord?.family,
          discipline: resultRecord?.specialtyId || resultRecord?.discipline,
          contextBands: telemetryContextBands(),
          result: outcome?.collected ? 'collected' : 'recorded'
        });
        if (recorded) {
          await state.awardActiveCompanionForField?.(
            resultRecord?.eventId || resultRecord?.claimId || resultRecord?.instanceId || completedSlot?.claimId,
            resultRecord?.firstIdentification === true || outcome?.event?.firstIdentification === true
          );
          discoveryHaptic([18, 36, 28]);
          state.ui.showResult(outcome);
        }
      }
      state.lastSnapshot = state.fieldSession.snapshot(position);
      state.ui.render(state.actions, state.lastSnapshot, state.activeActivityId);
      return true;
    }
    const phase = state.session.snapshot(position).phase;
    if (['idle', 'complete', 'collected', 'left'].includes(phase)) {
      state.session.sweep(position);
      state.ui.setOpen(false);
    }
    else if (['sweeping', 'signal'].includes(phase)) {
      if (state.session.refine(position)) discoveryHaptic(20);
    }
    else if (phase === 'classified') {
      if (state.session.excavate()) discoveryHaptic([16, 28, 16]);
    }
    else if (phase === 'revealed') {
      const recorded = await state.session.collect(profileStore, {
        toolId: 'metal-detector',
        regionLabel,
        locationKey: state.locationKey,
        locationSnapshot: { ...worldIdentity.location, name: state.regionLabel },
        environment: appCtx.getEnv?.() || 'EARTH',
        localPosition: position
      });
      if (recorded) await state.refreshToolProgress();
      await state.ui.refreshData();
      const instanceId = state.session.snapshot(position).collectionResult?.instanceId;
      const item = (await profileStore.listItems(200)).find((entry) => entry.instanceId === instanceId);
      void syncTrustedReceipt(appCtx, profileStore, item);
      if (recorded) emitDiscoveryTelemetry('discovery_recorded', {
        activityId: 'metal-detect',
        catalogFamily: item?.family,
        discipline: item?.discipline,
        contextBands: telemetryContextBands(),
        result: 'collected'
      });
      if (recorded) {
        await state.awardActiveCompanionForField?.(item?.eventId || item?.claimId || item?.instanceId, item?.firstIdentification === true);
        discoveryHaptic([20, 35, 40]);
        state.ui.showResult(state.session.snapshot(position).collectionResult);
      }
    }
    state.detectorSnapshot = state.session.snapshot(position);
    state.lastSnapshot = state.detectorSnapshot;
    const slot = encounters.slots.find((entry) => entry.id === state.lastSnapshot.targetId);
    state.presentation.setRevealed(slot, state.lastSnapshot.phase === 'revealed');
    state.presentation.setExcavation(slot, state.lastSnapshot.phase);
    state.ui.render(state.actions, state.lastSnapshot, state.activeActivityId);
    return true;
  };
  state.handleSecondary = async () => {
    const position = playerPosition(appCtx);
    if (state.activeActivityId !== 'metal-detect') {
      if (state.fieldSession.snapshot().phase === 'revealed') state.fieldSession.leave();
      else state.ui.setOpen(false);
      state.lastSnapshot = state.fieldSession.snapshot();
      state.ui.render(state.actions, state.lastSnapshot, state.activeActivityId);
      return true;
    }
    const phase = state.session.snapshot(position).phase;
    if (['classified', 'revealed'].includes(phase)) state.session.leave();
    else state.ui.setOpen(false);
    state.detectorSnapshot = state.session.snapshot(position);
    state.lastSnapshot = state.detectorSnapshot;
    state.presentation.setRevealed(null, false);
    state.ui.render(state.actions, state.lastSnapshot, state.activeActivityId);
    return true;
  };
  state.ui = createDiscoveryUi(state);
  appCtx.worldDiscoveryPublication = publication;
  appCtx.worldDiscoveryRuntime = state;
  appCtx.worldDiscoveryRuntimeSnapshot = () => worldDiscoveryRuntimeSnapshot(appCtx);
  void hydrateSignedInReceipts(appCtx, profileStore, claimedIds).then(() => state.ui?.refreshData?.());
  appCtx.toggleWorldDiscoveryJournal = (force) => {
    const next = typeof force === 'boolean' ? force : !state.ui.open;
    state.ui.setOpen(next);
    state.ui.render(state.actions, state.lastSnapshot, state.activeActivityId);
    return true;
  };
  appCtx.openWorldDiscoverySection = (section = 'today') => {
    state.ui.setTab(section);
    state.ui.setOpen(true);
    state.ui.render(state.actions, state.lastSnapshot, state.activeActivityId);
    return true;
  };
  appCtx.handleWorldDiscoveryToolUse = (toolId) => state.useEquippedFieldTool(toolId);
  state.unregisterCompanionTrainingInteraction = appCtx.registerContextInteraction?.({
    id: 'world_discovery_companion_training',
    priority: 96,
    evaluate: () => {
      if (state.disposed || state.ui?.open || appCtx.Walk?.state?.mode !== 'walk' || appCtx.getEnv?.() !== 'EARTH') return null;
      const exercise = state.companionRuntime?.exerciseSnapshot?.(playerPosition(appCtx));
      if (!exercise?.active || !exercise.readyToCall) return null;
      return {
        available: true,
        action: 'call_companion',
        label: 'Call',
        detail: `${state.companionRuntime.snapshot().activeName} · Recall practice`,
        distance: 0,
        data: { exercise: 'recall' }
      };
    },
    perform: () => {
      const called = state.companionRuntime?.callRecall?.(playerPosition(appCtx)) === true;
      if (called) appCtx.showToast?.('Good call. Wait for your companion to return.');
      return called;
    }
  });
  state.unregisterWildlifeInteraction = appCtx.registerContextInteraction?.({
    id: 'world_discovery_wildlife',
    priority: 81,
    evaluate: () => {
      if (state.disposed || state.ui?.open || appCtx.Walk?.state?.mode !== 'walk' || appCtx.getEnv?.() !== 'EARTH') return null;
      const observation = wildlifeObservationTuning(state.resolveCharacterCapability('wildlife-observation'));
      const handling = companionHandlingTuning(state.resolveCharacterCapability('companion-handling'));
      const nearby = state.wildlifeRuntime?.nearest?.(playerPosition(appCtx), observation.observationRadiusMeters);
      if (!nearby) return null;
      const actor = nearby.actor;
      if (actor.companionPolicy === 'trust-sequence-required' && nearby.distance > handling.trustRadiusMeters) return null;
      const companionCatalogId = actor.companionPolicy === 'trust-sequence-required'
        ? actor.speciesId
        : WILDLIFE_COMPANION_CATALOG[actor.speciesId];
      const encounter = companionCatalogId ? state.companionEncounterState(companionCatalogId, actor.id) : { step: 0, trustState: 'Wary' };
      const progress = Number(encounter.step || 0);
      const isCat = ['harbor-cat', 'meadow-tabby', 'midnight-cat'].includes(actor.speciesId);
      const label = actor.companionPolicy === 'trust-sequence-required'
        ? (state.companionExercise?.actorId === actor.id
          ? 'Stay still'
          : (isCat ? ['Watch', 'Sit quietly', 'Play', 'Name'][Math.min(3, progress)] : ['Watch', 'Wait', 'Greet', 'Name'][Math.min(3, progress)]))
        : 'Observe';
      return {
        available: true,
        action: actor.companionPolicy === 'trust-sequence-required' ? 'build_animal_trust' : 'observe_wildlife',
        label,
        detail: actor.companionPolicy === 'trust-sequence-required'
          ? `${actor.label} · ${encounter.trustState || 'Wary'} · ${handling.cueLabel}`
          : `${actor.label} · ${observation.cueLabel}`,
        distance: nearby.distance,
        data: {
          actorId: actor.id,
          speciesId: actor.speciesId,
          companionPolicy: actor.companionPolicy,
          x: nearby.x,
          y: nearby.y,
          z: nearby.z
        }
      };
    },
    perform: (candidate) => state.handleWorldWildlifeInteraction(candidate)
  });
  appCtx.registerRuntimeSystem?.({
    id: `${owner}:runtime`, owner, phase: 'presentation', priority: 24, critical: false,
    enabled: () => !state.disposed && appCtx.worldPublication?.requestId === publication.requestId && appCtx.worldPublication?.sequence === publication.sequence,
    update(frame) {
      const position = playerPosition(appCtx);
      state.actionTimer -= frame.dt;
      if (state.actionTimer <= 0) {
        state.actionTimer = 0.2;
        // Choices describe the place where the panel was opened. Hold them
        // steady while the player is reading or selecting; refresh again once
        // the panel is closed and movement resumes.
        if (!state.ui?.open || !state.actions.length) {
          state.actions = resolveContextActions({ environment, interaction, position, limit: 25 })
            .filter((action) => RELEASED_EXPLORER_ACTIVITIES.has(action.id))
            .filter((action) => {
              const toolId = ACTIVITY_TOOL[action.id];
              return !toolId || state.entitlements.canUseTool(toolId).allowed;
            })
            .slice(0, 3);
        }
        state.currentCellId = state.actions[0]?.cellId || null;
      }
      state.detectorSnapshot = state.session.update(position, frame.dt);
      if (state.activeActivityId === 'metal-detect') {
        state.lastSnapshot = state.detectorSnapshot;
      } else {
        state.lastSnapshot = state.fieldSession.update(frame.dt, position, { evaluateFieldTarget: state.evaluateFieldTarget });
        if (state.lastSnapshot.phase !== state.fieldFeedbackPhase) {
          if (state.lastSnapshot.phase === 'observing') {
            discoveryHaptic(14);
            playDiscoveryCue(state, 'focus');
          } else if (state.lastSnapshot.phase === 'revealed') {
            discoveryHaptic([16, 24, 32]);
            playDiscoveryCue(state, 'revealed');
          }
          state.fieldFeedbackPhase = state.lastSnapshot.phase;
        }
      }
      const targetSlot = encounters.slots.find((entry) => entry.id === state.detectorSnapshot.targetId);
      const fieldTargetSlot = fieldActivities.slots.find((entry) => entry.id === state.lastSnapshot.targetId);
      state.presentation.setRevealed(targetSlot, state.activeActivityId === 'metal-detect' && state.detectorSnapshot.phase === 'revealed');
      state.presentation.setExcavation(targetSlot, state.activeActivityId === 'metal-detect' ? state.detectorSnapshot.phase : 'idle');
      state.presentation.setFieldRevealed(fieldTargetSlot, state.activeActivityId !== 'metal-detect' && ['revealed', 'recorded'].includes(state.lastSnapshot.phase));
      state.presentation.update(position, state.lastSnapshot, frame.dt, state.activeActivityId);
      const travelMode = appCtx.Walk?.state?.mode === 'walk' ? appCtx.urbanSandboxRuntime?.parachute?.skydiving ? 'skydive' : 'walk' : appCtx.boatMode?.active ? 'boat' : appCtx.droneMode ? 'drone' : appCtx.planeMode?.active ? 'plane' : 'car';
      state.companionRuntime?.update?.(position, frame.dt, travelMode, appCtx.getEnv?.() || 'EARTH');
      state.wildlifeRuntime?.update?.(position, frame.dt, appCtx.getEnv?.() || 'EARTH');
      const liveGps = appCtx.getLiveGpsSnapshot?.() || { active: false };
      const operationActive = !!state.lastSnapshot?.active && !['complete', 'collected', 'recorded', 'left'].includes(state.lastSnapshot?.phase);
      state.encounterLead = state.encounterDirector.update({
        dt: frame.dt,
        position,
        walking: appCtx.Walk?.state?.mode === 'walk',
        earth: appCtx.getEnv?.() === 'EARTH',
        liveGpsActive: liveGps.active === true,
        operationActive,
        blocked: state.ui?.open || appCtx.paused || appCtx.showLargeMap || appCtx.getFishingSnapshot?.().open === true
      });
      state.ui.render(state.actions, state.lastSnapshot, state.activeActivityId);
      if (state.activeActivityId === 'metal-detect') playDetectorTone(state, state.detectorSnapshot, frame.dt);
    }
  });
  state.ui.render(state.actions, state.lastSnapshot, state.activeActivityId);
  return state;
}

function worldDiscoveryRuntimeSnapshot(appCtx) {
  const state = appCtx?.worldDiscoveryRuntime;
  if (!state) return Object.freeze({ active: false });
  const arFieldChallenge = state.getArChallengeEligibility?.() || null;
  const waterCells = state.environment?.cells?.filter((cell) =>
    cell.contexts?.some((context) => ['wetland', 'riverbank', 'fresh-water', 'coast', 'beach'].includes(context))
  ) || [];
  const actorPosition = playerPosition(appCtx);
  return Object.freeze({
    active: !state.disposed,
    requestId: state.publication.requestId,
    sequence: state.publication.sequence,
    worldIdentity: state.publication.worldIdentity.id,
    currentCellId: state.currentCellId,
    actions: state.actions.map((action) => ({ id: action.id, label: action.label, suitabilityBand: action.suitabilityBand })),
    activeActivityId: state.activeActivityId,
    equippedToolId: state.equippedToolId,
    entitlement: state.entitlements.snapshot(),
    interaction: state.lastSnapshot,
    fieldExpedition: state.fieldExpedition?.snapshot?.(playerPosition(appCtx), state.evaluateFieldTarget) || null,
    missionAuthority: state.retentionSnapshot?.missionAuthority || null,
    logicalEncounterSlots: state.publication.encounters.slots.length,
    logicalFieldActivitySlots: state.publication.fieldActivities?.slots.length || 0,
    regionalEcology: Object.freeze({
      packId: state.publication.fieldActivities?.diagnostics?.regionalEcologyPackId || null,
      packVersion: state.publication.fieldActivities?.diagnostics?.regionalEcologyPackVersion || null,
      taxonCount: state.publication.fieldActivities?.diagnostics?.regionalTaxonCount || 0,
      truthClass: state.publication.fieldActivities?.diagnostics?.regionalEcologyPackId ? 'habitat-plausible' : null,
      livePresenceClaim: false
    }),
    creatureQuality: state.creatureQualityAudit,
    presentation: state.presentation.diagnostics,
    companions: state.companionRuntime?.snapshot?.() || { owned: 0, activeInstanceId: null },
    wildlife: state.wildlifeRuntime?.snapshot?.() || { active: 0, logical: state.publication.wildlife?.actors?.length || 0 },
    encounterLead: state.encounterLead || null,
    arFieldChallenge,
    arHabitatContext: Object.freeze({
      playerPosition: Object.freeze({ x: Number(actorPosition.x || 0), z: Number(actorPosition.z || 0) }),
      cellSize: Number(state.environment?.coverage?.cellSize || 0),
      cellCount: Number(state.environment?.coverage?.cellCount || 0),
      waterCellCount: waterCells.length,
      nearestWaterCells: Object.freeze(waterCells.map((cell) => Object.freeze({
        cellId: cell.cellId,
        center: Object.freeze({ x: Number(cell.center?.x || 0), z: Number(cell.center?.z || 0) }),
        contexts: Object.freeze([...(cell.contexts || [])])
      })).sort((left, right) =>
        Math.hypot(left.center.x - actorPosition.x, left.center.z - actorPosition.z) -
        Math.hypot(right.center.x - actorPosition.x, right.center.z - actorPosition.z)
      ).slice(0, 4))
    }),
    generatedWithAdditionalProviderQueries: false,
    error: state.lastSnapshot?.error || ''
  });
}

export { RELEASED_EXPLORER_ACTIVITIES, disposeWorldDiscoveryRuntime, startWorldDiscoveryRuntime, worldDiscoveryRuntimeSnapshot };
