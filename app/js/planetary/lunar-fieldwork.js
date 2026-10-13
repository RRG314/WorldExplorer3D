import { lunarFieldPlan } from './lunar-survey.js';
import { APOLLO11_SURFACE_REGION } from './runtime/surface-authority.js?v=5';
import { planetarySurfaceYAtRenderXZ } from './runtime/surface-query.js?v=3';
import { stageSurfacePod, getStagedSurfacePod, releaseStagedEarthPod, consumeStagedEarthPod, playSurfacePodLaunch } from './surface-pod-launch.js?v=11';

let fieldWorld = null;
let narrowScreen = null;

function showLunarPanel(ctx) {
  let panel = document.getElementById('solidWorldPanel');
  if (!panel) { panel = document.createElement('aside'); panel.id = 'solidWorldPanel'; document.body.appendChild(panel); }
  panel.style.cssText = 'position:fixed;top:76px;right:18px;left:auto;z-index:999;background:rgba(10,20,27,.9);border:1px solid #526773;padding:10px;color:#fff;font:12px Inter,sans-serif;width:220px;max-width:calc(100vw - 40px);line-height:1.4;display:block';
  panel.dataset.fieldBody = 'moon';
  panel.innerHTML = '<details open><summary style="cursor:pointer;font-weight:700">Lunar Field Book</summary><p>Compare Site A and Site B. Use E at each instrument. Return to Pathfinder whenever you need to; saved records stay in your Journal.</p><small id="lunarFieldPower" style="display:block;margin-bottom:6px"></small><button id="lunarPowerRetry" class="floatItem" type="button" hidden>Retry battery save</button><canvas id="planetaryFieldMap" width="220" height="105" style="display:block;width:100%;height:105px" aria-label="Lunar stations and return pod"></canvas><small id="planetaryFieldHint" style="display:block;margin-top:6px"></small><button id="planetaryJournalBtn" class="floatItem" type="button">Open Journal</button><small style="display:block;margin-top:6px;color:#b4c4ce">Simulated samples · NASA/ASU lunar terrain</small></details>';
  panel.querySelector('#lunarPowerRetry').addEventListener('click', () => ctx.retryLunarFieldPower?.());
  panel.querySelector('#planetaryJournalBtn').addEventListener('click', () => ctx.openPlanetaryJournal?.('journal'));
  // Keep the world visible on a small display; the player can expand the map.
  if (!narrowScreen && globalThis.matchMedia) {
    narrowScreen = globalThis.matchMedia('(max-width: 600px)');
    narrowScreen.addEventListener('change', event => {
      const current = document.getElementById('solidWorldPanel');
      if (current?.dataset.fieldBody === 'moon') {
        current.style.width = event.matches ? 'min(180px, calc(100vw - 220px))' : '220px';
        if (event.matches) current.querySelector('details')?.removeAttribute('open');
      }
    });
  }
  if (narrowScreen?.matches || globalThis.innerWidth < 600) { panel.querySelector('details').open = false; panel.style.width = 'min(180px, calc(100vw - 220px))'; }
}

export function activateLunarFieldwork(ctx) {
  if (!ctx.onMoon || ctx.moonSurface?.userData.ready !== true) return false;
  const spawn = { x: 200, z: -950 };
  const mission = ctx.getDestinationMissionSnapshot?.();
  const strategy = mission?.destinationId === 'moon' ? mission.preparation?.strategy || 'samples' : 'samples';
  const plan = lunarFieldPlan(strategy);
  const heights = plan.map(entry => planetarySurfaceYAtRenderXZ(ctx, spawn.x + entry.offset.x, spawn.z + entry.offset.z, { bodyId: 'moon' }));
  if (!heights.every(Number.isFinite)) return false;
  if (fieldWorld && fieldWorld.strategy !== strategy) {
    const geometries = new Set(), materials = new Set();
    for (const object of fieldWorld.objects) {
      object.parent?.remove(object);
      object.traverse(node => { if (node.geometry) geometries.add(node.geometry); for (const material of [].concat(node.material || [])) materials.add(material); });
    }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    fieldWorld = null;
  }
  fieldWorld ||= { objects: [], strategy };
  for (const object of fieldWorld.objects) { object.visible = true; ctx.scene.add(object); }
  const pack = { bodyId: 'moon', bodyName: 'Moon', spawn, manifest: APOLLO11_SURFACE_REGION, fieldNotes: plan };
  ctx.markExpeditionPodLanded?.('moon');
  ctx.updateDestinationMissionRuntime?.();
  const pod = stageSurfacePod(ctx, { bodyId: 'moon', onBoard: boardingPod => {
    const journey = ctx.getInterstellarExpeditionSnapshot?.()?.podJourney;
    if (journey?.bodyId === 'moon' && journey.contactId === 'destination-mission:moon') return ctx.leaveDestinationMissionSurface?.('moon') === true;
    return playSurfacePodLaunch(ctx, { bodyId: 'moon', pod: boardingPod, onCommit: () => {
      consumeStagedEarthPod(boardingPod);
      return ctx.startSpaceFlightToEarth?.({ surfaceLaunchCommitted: true }) === true;
    } });
  } });
  if (pod) pack.returnPoint = { x: pod.position.x, z: pod.position.z };
  ctx.activatePlanetaryFieldActivities?.(pack, fieldWorld, (x, z) => planetarySurfaceYAtRenderXZ(ctx, x, z, { bodyId: 'moon' }) - pack.manifest.renderPlacement.y);
  showLunarPanel(ctx);
  return true;
}

export function hideLunarFieldwork(ctx) {
  ctx.clearPlanetaryFieldActivities?.();
  for (const object of fieldWorld?.objects || []) { object.visible = false; object.parent?.remove(object); }
  if (getStagedSurfacePod('moon')) releaseStagedEarthPod();
  const panel = document.getElementById('solidWorldPanel');
  if (panel) panel.style.display = 'none';
}
