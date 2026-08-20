import { ctx as appCtx } from './shared-context.js?v=55';
import { fishMetricText, generateFish } from './fishing/catalog.js?v=2';
import { normalizeDepthEvidence } from './geospatial/bathymetry-evidence.js?v=1';
import { clearFishingScene, drawFishPortrait, updateFishingScene } from './fishing/visuals.js?v=3';
import { getScreenLayoutService } from './ui/screen-layout.js?v=1';

const CATCH_STORAGE_KEY = 'worldExplorer3D.fishing.catches.v1';
const MAX_SAVED_CATCHES = 60;

const state = {
  open: false,
  active: false,
  stage: 'idle',
  stageTimer: 0,
  fish: null,
  fishStamina: 1,
  lineTension: 0,
  lineIntegrity: 1,
  reelProgress: 0,
  drag: 0.48,
  reeling: false,
  givingLine: false,
  rodDirection: 0,
  fishDirection: 1,
  currentBurst: 0,
  burstTimer: 0,
  nextBurstAt: 0,
  slackTimer: 0,
  fightElapsed: 0,
  maxTension: 0,
  message: 'Stop the boat and cast into the water.',
  catches: [],
  lastUiAt: 0,
  portraitPhase: 0,
  cameraModeBeforeOpen: null,
  pointerStartY: 0
};

const refs = {};
let bound = false;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function loadCatches() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CATCH_STORAGE_KEY) || '[]');
    state.catches = Array.isArray(parsed) ? parsed.filter((entry) => entry && entry.species).slice(0, MAX_SAVED_CATCHES) : [];
  } catch (_) {
    state.catches = [];
  }
}

function saveCatches() {
  try {
    localStorage.setItem(CATCH_STORAGE_KEY, JSON.stringify(state.catches.slice(0, MAX_SAVED_CATCHES)));
  } catch (_) {
    // A catch still counts for the current session when storage is unavailable.
  }
}

function currentGeo() {
  const boat = appCtx.boat || { x: 0, z: 0 };
  const converted = appCtx.worldToLatLon?.(boat.x, boat.z);
  return {
    lat: Number.isFinite(Number(converted?.lat)) ? Number(converted.lat) : Number(appCtx.LOC?.lat) || 0,
    lon: Number.isFinite(Number(converted?.lon)) ? Number(converted.lon) : Number(appCtx.LOC?.lon) || 0
  };
}

function currentLocationLabel() {
  if (appCtx.selLoc === 'custom') return String(appCtx.customLoc?.name || 'Custom Water').slice(0, 80);
  return String(appCtx.LOCS?.[appCtx.selLoc]?.name || appCtx.LOC?.name || 'Open Water').slice(0, 80);
}

function waterLabel() {
  const kind = String(appCtx.boatMode?.waterKind || 'water').replace(/_/g, ' ');
  return kind.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function currentBathymetryEvidence() {
  const location = appCtx.selLoc === 'custom' ? appCtx.customLoc : appCtx.LOC;
  return normalizeDepthEvidence(location?.surfaceEvidence?.bathymetry);
}

function boatSpeed() {
  return Math.abs(Number(appCtx.boat?.forwardSpeed ?? appCtx.boat?.speed) || 0);
}

function canCast() {
  return !!appCtx.boatMode?.active && boatSpeed() <= 2.4 && !['casting', 'waiting', 'bite', 'fighting'].includes(state.stage);
}

function stageActionLabel() {
  if (state.stage === 'bite') return 'HOOK';
  if (state.stage === 'casting' || state.stage === 'waiting') return 'LINE OUT';
  if (state.stage === 'fighting') return 'FIGHT';
  return 'CAST';
}

function stageGestureLabel() {
  if (state.stage === 'bite') return 'LIFT TO SET HOOK';
  if (state.stage === 'casting') return 'CASTING';
  if (state.stage === 'waiting') return 'WATCH THE LINE';
  if (state.stage === 'fighting') return 'DRAG TO STEER · HOLD TO REEL';
  if (state.stage === 'landed') return 'CATCH LANDED';
  return 'TAP WATER TO CAST';
}

function setMessage(message) {
  state.message = String(message || '');
}

function setStage(stage, message, duration = 0) {
  state.stage = stage;
  state.stageTimer = Math.max(0, Number(duration) || 0);
  if (message) setMessage(message);
  state.lastUiAt = 0;
}

function stopFight(reason = 'Fishing ended.') {
  state.active = false;
  state.reeling = false;
  state.givingLine = false;
  state.rodDirection = 0;
  state.currentBurst = 0;
  state.burstTimer = 0;
  if (['casting', 'waiting', 'bite', 'fighting'].includes(state.stage)) setStage('lost', reason);
  clearFishingScene();
}

function startCast() {
  if (!appCtx.boatMode?.active) {
    setMessage('BOAT REQUIRED');
    renderUi(true);
    return false;
  }
  if (boatSpeed() > 2.4) {
    setMessage('SLOW BOAT');
    renderUi(true);
    return false;
  }
  if (['casting', 'waiting', 'fighting'].includes(state.stage)) return false;
  if (state.stage === 'bite') return setHook();

  state.active = true;
  state.fish = null;
  state.lineTension = 0;
  state.lineIntegrity = 1;
  state.reelProgress = 0;
  state.fishStamina = 1;
  state.fightElapsed = 0;
  state.slackTimer = 0;
  state.maxTension = 0;
  state.rodDirection = 0;
  setStage('casting', 'CASTING', 0.9);
  return true;
}

function prepareBite() {
  const geo = currentGeo();
  const bathymetry = currentBathymetryEvidence();
  state.fish = {
    ...generateFish({
    waterKind: appCtx.boatMode?.waterKind || 'coastal',
    latitude: geo.lat
    }),
    occurrenceTruth: 'simulated-gameplay-event',
    habitatBasis: {
      model: 'water-kind-latitude-v1',
      waterKind: String(appCtx.boatMode?.waterKind || 'water'),
      latitude: Number(geo.lat.toFixed(6)),
      bathymetryTruth: bathymetry.truthType,
      depthMeters: bathymetry.depthMeters,
      depthSourceId: bathymetry.sourceId
    }
  };
  state.fishDirection = Math.random() < 0.5 ? -1 : 1;
  setStage('bite', 'BITE — LIFT', 2.35);
}

function setHook() {
  if (state.stage !== 'bite' || !state.fish) return false;
  state.fishStamina = 1;
  state.lineTension = 0.34;
  state.lineIntegrity = 1;
  state.reelProgress = 0.08;
  state.fightElapsed = 0;
  state.slackTimer = 0;
  state.currentBurst = 0.35;
  state.burstTimer = 0.8;
  state.nextBurstAt = 0.8 + Math.random() * 1.4;
  setStage('fighting', 'FISH ON');
  return true;
}

function beginBurst() {
  if (!state.fish) return;
  const behaviorBoost = {
    'power-dive': 0.24, sprint: 0.28, leap: 0.2, ambush: 0.17,
    'reef-run': 0.2, surge: 0.14, 'deep-dive': 0.12, 'head-shake': 0.08
  }[state.fish.behavior] || 0.06;
  state.fishDirection = Math.random() < 0.5 ? -1 : 1;
  state.currentBurst = clamp(0.42 + state.fish.strength * 0.36 + behaviorBoost + Math.random() * 0.14, 0, 1.08);
  state.burstTimer = 0.65 + Math.random() * (0.65 + state.fish.strength * 0.7);
  state.nextBurstAt = 1.25 + Math.random() * (2.4 - state.fish.strength * 0.7);
}

function loseFish(reason) {
  state.lineIntegrity = clamp(state.lineIntegrity);
  stopFight(reason);
}

function catchFish() {
  if (!state.fish) return;
  const geo = currentGeo();
  const efficiency = clamp(1 - state.fightElapsed / 210, 0.2, 1);
  const score = Math.max(1, Math.round(
    state.fish.baseScore + state.lineIntegrity * 360 + efficiency * 220 - state.maxTension * 35
  ));
  const entry = {
    ...state.fish,
    score,
    fightTimeMs: Math.round(state.fightElapsed * 1000),
    lineIntegrityPct: Math.round(state.lineIntegrity * 100),
    maxTensionPct: Math.round(state.maxTension * 100),
    waterKind: String(appCtx.boatMode?.waterKind || 'water'),
    location: currentLocationLabel(),
    lat: Number(geo.lat.toFixed(6)),
    lon: Number(geo.lon.toFixed(6)),
    caughtAt: new Date().toISOString()
  };
  state.fish = entry;
  state.catches.unshift(entry);
  state.catches = state.catches.slice(0, MAX_SAVED_CATCHES);
  saveCatches();
  state.active = false;
  state.reeling = false;
  state.givingLine = false;
  setStage('landed', 'LANDED');
  void appCtx.submitFishingScore?.(entry);
  globalThis.dispatchEvent?.(new CustomEvent('we3d-fishing-catch', { detail: entry }));
}

function updateFight(dt) {
  const fish = state.fish;
  if (!fish) return loseFish('FISH LOST');
  state.fightElapsed += dt;
  state.portraitPhase += dt * (1.8 + state.currentBurst * 3.2);
  state.nextBurstAt -= dt;
  if (state.nextBurstAt <= 0) beginBurst();
  if (state.burstTimer > 0) {
    state.burstTimer -= dt;
  } else {
    state.currentBurst += (0 - state.currentBurst) * clamp(dt * 3.4);
  }

  const seaPressure = clamp(Number(appCtx.boatMode?.waveIntensity) || 0) * 0.12;
  const directionCounter = state.rodDirection === -state.fishDirection ? 1 : 0;
  const directionMistake = state.rodDirection === state.fishDirection ? 1 : 0;
  const reelEffort = state.reeling ? 1 : 0;
  const lineRelease = state.givingLine ? 1 : 0;
  const fishForce = clamp(
    fish.strength * (0.3 + state.fishStamina * 0.55) + state.currentBurst * 0.52 + seaPressure,
    0.08,
    1.2
  );
  const targetTension = clamp(
    0.12 + fishForce * 0.5 + state.drag * 0.34 + reelEffort * 0.18 + directionMistake * 0.14 -
    lineRelease * 0.42 - directionCounter * 0.12,
    0,
    1.25
  );
  const response = targetTension > state.lineTension ? 4.5 : 2.8;
  state.lineTension += (targetTension - state.lineTension) * (1 - Math.exp(-response * dt));
  state.maxTension = Math.max(state.maxTension, state.lineTension);

  const safePressure = state.lineTension >= 0.24 && state.lineTension <= 0.82;
  if (safePressure) {
    const counterBonus = directionCounter ? 1.22 : 1;
    const dragEfficiency = 0.7 + state.drag * 0.58;
    state.fishStamina -= dt * (0.018 + reelEffort * 0.035) * counterBonus * dragEfficiency;
  } else if (state.lineTension < 0.18) {
    state.fishStamina += dt * 0.018;
  }
  state.fishStamina = clamp(state.fishStamina);

  if (state.reeling && safePressure) {
    const fatigueBonus = 0.42 + (1 - state.fishStamina) * 1.22;
    const resistance = 1 - fish.strength * state.fishStamina * 0.36;
    state.reelProgress += dt * 0.045 * fatigueBonus * resistance;
  }
  if (state.givingLine) state.reelProgress -= dt * (0.016 + state.currentBurst * 0.018);
  if (state.currentBurst > 0.68 && !directionCounter) state.reelProgress -= dt * state.currentBurst * 0.025;
  state.reelProgress = clamp(state.reelProgress);

  if (state.lineTension > 0.84) {
    const overload = state.lineTension - 0.84;
    state.lineIntegrity -= dt * overload * (0.55 + fish.strength * 0.75);
  } else if (state.lineTension < 0.14) {
    state.slackTimer += dt;
  } else {
    state.slackTimer = Math.max(0, state.slackTimer - dt * 1.4);
  }
  state.lineIntegrity = clamp(state.lineIntegrity);

  if (state.lineIntegrity <= 0.001) return loseFish('LINE SNAPPED');
  if (state.slackTimer > 2.75) return loseFish('HOOK LOST');
  if (state.fightElapsed > 240) return loseFish('FISH ESCAPED');
  if (state.reelProgress >= 0.995 && state.fishStamina <= 0.28) return catchFish();

  const direction = state.fishDirection < 0 ? 'left' : 'right';
  if (state.lineTension > 0.84) setMessage('GIVE LINE');
  else if (state.lineTension < 0.18) setMessage('REEL — LINE SLACK');
  else if (state.currentBurst > 0.58) setMessage(`PULL ${direction.toUpperCase()}`);
  else if (state.fishStamina < 0.3) setMessage('FISH TIRING');
  else setMessage('HOLD PRESSURE');
}

function updateStage(dt) {
  if (!state.active) return;
  if (!appCtx.boatMode?.active) {
    stopFight('Fishing ended when you left the boat.');
    return;
  }
  if (state.stage === 'casting') {
    state.stageTimer -= dt;
    if (state.stageTimer <= 0) {
      const wait = 1.8 + Math.random() * 3.8;
      setStage('waiting', 'WAIT', wait);
    }
  } else if (state.stage === 'waiting') {
    state.stageTimer -= dt;
    if (state.stageTimer <= 0) prepareBite();
  } else if (state.stage === 'bite') {
    state.stageTimer -= dt;
    if (state.stageTimer <= 0) loseFish('MISSED BITE');
  } else if (state.stage === 'fighting') {
    updateFight(dt);
  }
}

function catchSummary() {
  const catches = state.catches;
  const best = catches.reduce((winner, entry) => !winner || Number(entry.score) > Number(winner.score) ? entry : winner, null);
  const heaviest = catches.reduce((winner, entry) => !winner || Number(entry.weightKg) > Number(winner.weightKg) ? entry : winner, null);
  const species = new Set(catches.map((entry) => entry.speciesId || entry.species)).size;
  return { total: catches.length, species, best, heaviest };
}

function renderCatches() {
  if (!refs.catches) return;
  if (!state.catches.length) {
    refs.catches.innerHTML = '<li>No catches yet. Your recent catches and personal records will appear here.</li>';
    return;
  }
  refs.catches.innerHTML = state.catches.slice(0, 6).map((entry) => `
    <li>
      <strong>${safeText(entry.species)}</strong>
      <span>${safeText(entry.rarityLabel || entry.rarity)} | ${safeText(fishMetricText(entry))}</span>
      <em>${Math.max(0, Number(entry.score) || 0)} pts | ${safeText(entry.location || '')}</em>
    </li>
  `).join('');
}

function meter(element, value, danger = false) {
  if (!element) return;
  const pct = Math.round(clamp(value) * 100);
  element.style.width = `${pct}%`;
  element.parentElement?.style.setProperty('--meter-value', `${pct}%`);
  element.classList.toggle('danger', danger);
}

function resizeFishingCanvas() {
  if (!refs.canvas) return;
  const bounds = refs.canvas.getBoundingClientRect();
  const ratio = Math.min(2, Math.max(1, Number(globalThis.devicePixelRatio) || 1));
  const width = Math.max(320, Math.round(bounds.width * ratio));
  const height = Math.max(240, Math.round(bounds.height * ratio));
  if (refs.canvas.width !== width) refs.canvas.width = width;
  if (refs.canvas.height !== height) refs.canvas.height = height;
}

function renderUi(force = false) {
  const now = performance.now();
  if (!force && now - state.lastUiAt < 65) return;
  state.lastUiAt = now;
  const boatActive = !!appCtx.boatMode?.active;
  refs.dock?.classList.toggle('show', boatActive);
  refs.menuItem && (refs.menuItem.style.display = boatActive ? '' : 'none');
  refs.panel?.classList.toggle('open', state.open);
  refs.panel?.setAttribute('aria-hidden', state.open ? 'false' : 'true');
  if (!state.open) return;

  refs.panel.dataset.stage = state.stage;
  resizeFishingCanvas();

  if (refs.stage) refs.stage.textContent = state.stage.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (refs.message) refs.message.textContent = state.message;
  if (refs.water) refs.water.textContent = `${waterLabel()} | ${String(appCtx.boatMode?.seaState || 'moderate')} sea`;
  if (refs.speed) refs.speed.textContent = `${boatSpeed().toFixed(1)} m/s`;
  if (refs.action) {
    const actionLabel = stageActionLabel();
    if (refs.actionLabel) refs.actionLabel.textContent = actionLabel;
    refs.action.setAttribute('aria-label', actionLabel === 'HOOK' ? 'Set fishing hook' : 'Cast fishing line');
    refs.action.disabled = state.stage === 'casting' || state.stage === 'waiting' || state.stage === 'fighting' || (!canCast() && state.stage !== 'bite');
  }
  if (refs.gestureLabel) refs.gestureLabel.textContent = stageGestureLabel();
  if (refs.fishName) refs.fishName.textContent = state.fish?.species || (state.stage === 'waiting' ? 'Line in water' : 'Open water');
  if (refs.fishMeta) refs.fishMeta.textContent = state.fish && ['landed', 'lost'].includes(state.stage) ? `${state.fish.rarityLabel} · ${fishMetricText(state.fish)}` : '';
  meter(refs.tensionFill, state.lineTension, state.lineTension > 0.84 || state.lineTension < 0.14 && state.stage === 'fighting');
  meter(refs.staminaFill, 1 - state.fishStamina);
  meter(refs.integrityFill, state.lineIntegrity, state.lineIntegrity < 0.35);
  meter(refs.progressFill, state.reelProgress);
  if (refs.tensionValue) refs.tensionValue.textContent = `${Math.round(state.lineTension * 100)}%`;
  if (refs.staminaValue) refs.staminaValue.textContent = `${Math.round((1 - state.fishStamina) * 100)}%`;
  if (refs.integrityValue) refs.integrityValue.textContent = `${Math.round(state.lineIntegrity * 100)}%`;
  if (refs.progressValue) refs.progressValue.textContent = `${Math.round(state.reelProgress * 100)}%`;
  if (refs.drag) refs.drag.value = String(Math.round(state.drag * 100));
  if (refs.dragValue) refs.dragValue.textContent = `${Math.round(state.drag * 100)}%`;
  refs.reel?.classList.toggle('active', state.reeling);
  refs.give?.classList.toggle('active', state.givingLine);
  refs.rodLeft?.classList.toggle('active', state.rodDirection === -1);
  refs.rodCenter?.classList.toggle('active', state.rodDirection === 0);
  refs.rodRight?.classList.toggle('active', state.rodDirection === 1);

  const summary = catchSummary();
  if (refs.summary) refs.summary.textContent = `${summary.total} catch${summary.total === 1 ? '' : 'es'} · ${summary.species} species`;
  if (refs.record) refs.record.textContent = summary.heaviest ? `Est. ${Number(summary.heaviest.weightKg).toFixed(2)} kg best` : '';
  drawFishPortrait(refs.canvas, state.fish, {
    phase: state.portraitPhase,
    direction: state.fishDirection,
    stage: state.stage,
    tension: state.lineTension,
    progress: state.reelProgress,
    burst: state.currentBurst,
    rodDirection: state.rodDirection,
    reeling: state.reeling,
    givingLine: state.givingLine
  });
  renderCatches();
}

function openFishingGame() {
  if (!appCtx.boatMode?.active) return false;
  appCtx.toggleWorldDiscoveryJournal?.(false);
  appCtx.toggleUrbanEquipment?.(false);
  appCtx.screenLayout ||= getScreenLayoutService();
  appCtx.screenLayout.setActivityLayer('fishing', true);
  if (!state.open) state.cameraModeBeforeOpen = Number.isFinite(appCtx.camMode) ? appCtx.camMode : 0;
  appCtx.setCameraMode?.(0);
  state.open = true;
  if (!['casting', 'waiting', 'bite', 'fighting'].includes(state.stage)) {
    setMessage(boatSpeed() <= 2.4 ? 'READY' : 'SLOW BOAT');
  }
  renderUi(true);
  return true;
}

function closeFishingGame() {
  if (['casting', 'waiting', 'bite', 'fighting'].includes(state.stage)) stopFight('Fishing session ended.');
  state.open = false;
  if (Number.isFinite(state.cameraModeBeforeOpen)) appCtx.setCameraMode?.(state.cameraModeBeforeOpen);
  state.cameraModeBeforeOpen = null;
  appCtx.screenLayout ||= getScreenLayoutService();
  appCtx.screenLayout.setActivityLayer('fishing', false);
  renderUi(true);
  return true;
}

function updateFishingGame(dt) {
  const delta = clamp(dt, 0, 0.1);
  if (!appCtx.boatMode?.active && (state.open || state.active)) {
    state.open = false;
    stopFight('Fishing is available only from the surface boat.');
  }
  if (state.stage !== 'fighting') state.portraitPhase += delta * (state.stage === 'waiting' ? 1.6 : 0.8);
  updateStage(delta);
  updateFishingScene(state, appCtx, delta);
  renderUi(false);
  return state.active;
}

function bindHold(button, key) {
  if (!button) return;
  const start = (event) => {
    if (event.cancelable) event.preventDefault();
    state[key] = true;
    button.setPointerCapture?.(event.pointerId);
  };
  const stop = (event) => {
    if (event?.cancelable) event.preventDefault();
    state[key] = false;
  };
  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', stop);
  button.addEventListener('pointercancel', stop);
  button.addEventListener('lostpointercapture', stop);
}

function setRodFromCanvasPointer(event) {
  if (!refs.canvas || state.stage !== 'fighting') return;
  const bounds = refs.canvas.getBoundingClientRect();
  const normalizedX = (event.clientX - bounds.left) / Math.max(1, bounds.width);
  state.rodDirection = normalizedX < 0.42 ? -1 : normalizedX > 0.58 ? 1 : 0;
}

function bindFishingCanvas() {
  if (!refs.canvas) return;
  const stop = (event) => {
    if (event?.cancelable) event.preventDefault();
    state.reeling = false;
    state.givingLine = false;
  };
  refs.canvas.addEventListener('pointerdown', (event) => {
    if (event.cancelable) event.preventDefault();
    if (state.stage === 'bite') {
      setHook();
      return;
    }
    if (!['casting', 'waiting', 'fighting'].includes(state.stage)) {
      startCast();
      return;
    }
    if (state.stage !== 'fighting') return;
    state.pointerStartY = event.clientY;
    state.reeling = true;
    state.givingLine = false;
    setRodFromCanvasPointer(event);
    refs.canvas.setPointerCapture?.(event.pointerId);
  });
  refs.canvas.addEventListener('pointermove', (event) => {
    if (!state.reeling && !state.givingLine) return;
    if (event.cancelable) event.preventDefault();
    setRodFromCanvasPointer(event);
    const vertical = event.clientY - state.pointerStartY;
    state.givingLine = vertical > 42;
    state.reeling = !state.givingLine;
  });
  refs.canvas.addEventListener('pointerup', stop);
  refs.canvas.addEventListener('pointercancel', stop);
  refs.canvas.addEventListener('lostpointercapture', stop);
}

function setupFishingGame() {
  if (bound) return;
  Object.assign(refs, {
    dock: document.getElementById('fishingDockBtn'),
    menuItem: document.getElementById('fFishing'),
    panel: document.getElementById('fishingGamePanel'),
    close: document.getElementById('fishingCloseBtn'),
    stage: document.getElementById('fishingStage'),
    message: document.getElementById('fishingMessage'),
    water: document.getElementById('fishingWater'),
    speed: document.getElementById('fishingSpeed'),
    action: document.getElementById('fishingActionBtn'),
    actionLabel: document.getElementById('fishingActionLabel'),
    gestureLabel: document.getElementById('fishingGestureLabel'),
    canvas: document.getElementById('fishingCanvas'),
    fishName: document.getElementById('fishingFishName'),
    fishMeta: document.getElementById('fishingFishMeta'),
    tensionFill: document.getElementById('fishingTensionFill'),
    staminaFill: document.getElementById('fishingStaminaFill'),
    integrityFill: document.getElementById('fishingIntegrityFill'),
    progressFill: document.getElementById('fishingProgressFill'),
    tensionValue: document.getElementById('fishingTensionValue'),
    staminaValue: document.getElementById('fishingStaminaValue'),
    integrityValue: document.getElementById('fishingIntegrityValue'),
    progressValue: document.getElementById('fishingProgressValue'),
    drag: document.getElementById('fishingDrag'),
    dragValue: document.getElementById('fishingDragValue'),
    reel: document.getElementById('fishingReelBtn'),
    give: document.getElementById('fishingGiveBtn'),
    rodLeft: document.getElementById('fishingRodLeft'),
    rodCenter: document.getElementById('fishingRodCenter'),
    rodRight: document.getElementById('fishingRodRight'),
    summary: document.getElementById('fishingSummary'),
    record: document.getElementById('fishingRecord'),
    catches: document.getElementById('fishingCatchList')
  });
  loadCatches();
  refs.dock?.addEventListener('click', openFishingGame);
  refs.menuItem?.addEventListener('click', openFishingGame);
  refs.close?.addEventListener('click', closeFishingGame);
  refs.action?.addEventListener('click', () => state.stage === 'bite' ? setHook() : startCast());
  refs.drag?.addEventListener('input', (event) => {
    state.drag = clamp(Number(event.target.value) / 100, 0.15, 0.9);
    renderUi(true);
  });
  bindHold(refs.reel, 'reeling');
  bindHold(refs.give, 'givingLine');
  bindFishingCanvas();
  refs.rodLeft?.addEventListener('click', () => { state.rodDirection = -1; renderUi(true); });
  refs.rodCenter?.addEventListener('click', () => { state.rodDirection = 0; renderUi(true); });
  refs.rodRight?.addEventListener('click', () => { state.rodDirection = 1; renderUi(true); });

  window.addEventListener('keydown', (event) => {
    if (!state.open || event.repeat && event.code === 'KeyE') return;
    if (event.code === 'KeyE') {
      event.preventDefault();
      state.stage === 'bite' ? setHook() : startCast();
    } else if (event.code === 'Space' && state.stage === 'fighting') {
      event.preventDefault();
      state.reeling = true;
    } else if (event.code === 'KeyQ' && state.stage === 'fighting') {
      event.preventDefault();
      state.givingLine = true;
    } else if (event.code === 'KeyJ' || event.code === 'ArrowLeft') state.rodDirection = -1;
    else if (event.code === 'KeyK') state.rodDirection = 0;
    else if (event.code === 'KeyL' || event.code === 'ArrowRight') state.rodDirection = 1;
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') state.reeling = false;
    if (event.code === 'KeyQ') state.givingLine = false;
  });
  window.addEventListener('blur', () => {
    state.reeling = false;
    state.givingLine = false;
  });
  bound = true;
  renderUi(true);
}

function getFishingSnapshot() {
  return {
    open: state.open,
    active: state.active,
    stage: state.stage,
    fish: state.fish ? {
      species: state.fish.species,
      lengthCm: state.fish.lengthCm,
      weightKg: state.fish.weightKg,
      strength: state.fish.strength,
      rarity: state.fish.rarity,
      behavior: state.fish.behavior,
      measurementTruth: state.fish.measurementTruth,
      occurrenceTruth: state.fish.occurrenceTruth,
      habitatBasis: state.fish.habitatBasis,
      score: state.fish.score || state.fish.baseScore
    } : null,
    tension: state.lineTension,
    lineIntegrity: state.lineIntegrity,
    fishStamina: state.fishStamina,
    reelProgress: state.reelProgress,
    drag: state.drag,
    reeling: state.reeling,
    givingLine: state.givingLine,
    fishDirection: state.fishDirection,
    rodDirection: state.rodDirection,
    catches: state.catches.length,
    boatSpeed: boatSpeed(),
    visualMode: 'in-world-boat',
    controls: state.stage === 'fighting' ? 'drag horizontally to steer; hold/drag up to reel; drag down to give line' : 'tap water or E to cast/set hook'
  };
}

appCtx.fishingGame = state;
Object.assign(appCtx, {
  closeFishingGame,
  getFishingSnapshot,
  openFishingGame,
  setupFishingGame,
  startFishingCast: startCast,
  stopFishingGame: stopFight,
  updateFishingGame
});

export { closeFishingGame, getFishingSnapshot, openFishingGame, setupFishingGame, updateFishingGame };
