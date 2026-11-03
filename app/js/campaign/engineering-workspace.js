import {
  WORKSPACE_PROJECTS,
  workspaceProjectState,
  workspaceConstraint,
  validateWorkspaceProjectReport,
} from './workspace-projects.js';
import { validateWorkspacePlacement, workspaceGeometry } from './personal-workspace.js';
const escape = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
export function engineeringRoom(ctx, home) {
  const a = ctx.activeInterior;
  if (!a || a.ownedHome?.id !== home?.id || Number(a.activeLevel || 0) !== 0)
    throw Error('Enter the ground floor of your personal workspace.');
  const c = a.center,
    y = Number(a.floorBaseY || 0),
    relative = (p) => ({ x: p.x - c.x, z: p.z - c.z });
  const colliders = (ctx.dynamicBuildingColliders || [])
    .filter(
      (o) =>
        o.sourceBuildingId !== 'personal-workspace' &&
        o.maxY > y + 0.1 &&
        Number(o.minY ?? o.baseY ?? 0) < y + 1.75 &&
        o.maxX >= Math.min(...a.usableFootprint.map((p) => p.x)) &&
        o.minX <= Math.max(...a.usableFootprint.map((p) => p.x)) &&
        o.maxZ >= Math.min(...a.usableFootprint.map((p) => p.z)) &&
        o.minZ <= Math.max(...a.usableFootprint.map((p) => p.z))
    )
    .map((o) => ({
      minX: o.minX - c.x,
      maxX: o.maxX - c.x,
      minZ: o.minZ - c.z,
      maxZ: o.maxZ - c.z,
      minY: Number(o.minY ?? o.baseY ?? 0) - y,
      maxY: o.maxY - y,
    }));
  return {
    homeId: home.id,
    sourceBuildingId: home.sourceBuildingId,
    metersPerUnit: ctx.METERS_PER_WORLD_UNIT || 1.11,
    center: { x: 0, z: 0 },
    floorBaseY: 0,
    activeLevel: 0,
    entryPoint: relative(a.entryPoint),
    usableFootprint: a.usableFootprint.map(relative),
    colliders,
  };
}
export function engineeringProposal(room) {
  for (const p of [room.entryPoint, ...room.usableFootprint])
    for (const turn of [0, 1, 2, 3]) {
      const pose = { ...p, turn },
        r = validateWorkspacePlacement(room, pose, room.colliders),
        constraint = workspaceConstraint(r.reason || '');
      if (!r.ok && constraint !== 'unsupported') return { pose, constraint, reason: r.reason };
    }
  throw Error('This room has no supported inspection proposal. Your layout is kept.');
}
const homeKey = (id) => {
  let hash = 14695981039346656037n;
  for (const c of id) hash = BigInt.asUintN(64, (hash ^ BigInt(c.codePointAt(0))) * 1099511628211n);
  return hash.toString(16);
};
export const workspaceProjectEventId = (home, id) => `event:workspace:${homeKey(home.id)}:${id}:v1`;
export function workspaceProjectEvent(home, report) {
  validateWorkspaceProjectReport(report, validateWorkspacePlacement);
  if (report.homeId !== home.id || !WORKSPACE_PROJECTS[report.id] || report.schemaVersion !== 1)
    throw Error('This saved design does not belong to the selected workspace.');
  return {
    eventId: workspaceProjectEventId(home, report.id),
    eventType: 'campaign-completed',
    sourceSystem: 'explorer-campaign',
    sourceId: 'workspace-design',
    pathId: 'creation',
    name: report.title,
    detail: `A working ${report.design.purpose} desk: room fit checked, entrance route clear and saved record reviewed.`,
    occurredAt: report.completedAt,
    regionId: home.locationId,
    regionLabel: home.locationLabel,
    environment: 'EARTH',
    points: 0,
    projections: { profile: false, place: false },
    metadata: {
      careerId: 'engineering',
      variantId: report.id,
      workspaceDesignReport: structuredClone(report),
    },
  };
}
export function workspaceBrief(home, room, now) {
  return {
    eventId: `event:workspace-brief:${homeKey(home.id)}:v1`,
    eventType: 'observation',
    sourceSystem: 'explorer-campaign',
    sourceId: 'workspace-room-inspection',
    pathId: 'creation',
    name: 'Your workspace · room survey',
    detail: `Inspected the ground-floor footprint and entrance of ${home.label}. The proposed arrangement needs working clearance; check the actual room before placing furniture.`,
    occurredAt: now,
    regionId: home.locationId,
    regionLabel: home.locationLabel,
    environment: 'EARTH',
    points: 0,
    projections: { profile: false, place: false },
    metadata: { careerId: 'engineering', workspaceInspection: room },
  };
}
export function engineeringSummary(workspace = {}, variantId = 'campaign') {
  let p;
  try {
    p = workspaceProjectState(workspace);
    if (p.schemaVersion === 1)
      for (const r of Object.values(p.reports))
        validateWorkspaceProjectReport(r, validateWorkspacePlacement);
  } catch {
    return {
      title: 'Workspace needs recovery',
      summary: 'Your saved design is kept. Export your home backup before recovery.',
      choices: [],
      stages: [],
    };
  }
  if ((workspace.schemaVersion && workspace.schemaVersion !== 1) || p.schemaVersion !== 1)
    return {
      title: 'Update required',
      summary: 'This workspace project needs a newer version.',
      choices: [],
      stages: [],
    };
  const usable = !!workspace.pose && workspace.usedAt > 0 && workspace.rotated && workspace.undone,
    legacy = variantId === 'campaign' && !p.reports.campaign && usable;
  const a = p.active?.id === variantId ? p.active : null,
    done = !!p.reports[variantId] || legacy;
  return {
    title: WORKSPACE_PROJECTS[variantId]?.label || 'Make a Useful Place',
    summary: WORKSPACE_PROJECTS[variantId]?.question || '',
    resume: !!a,
    actionLabel: done ? 'Visit saved workspace' : undefined,
    choices: Object.values(WORKSPACE_PROJECTS)
      .filter((r) =>
        p.active
          ? r.id === p.active.id
          : r.id === 'campaign' || done || !!p.reports.campaign || usable
      )
      .map(({ id, label }) => ({ id, label })),
    stages: legacy
      ? [
          { label: 'Retained useful workspace: arranged, rotated and undone', complete: true },
          { label: 'Saved record reviewed at the desk', complete: true },
        ]
      : [
          { label: 'Inspect the actual room and its clearance', complete: done || !!a?.inspection },
          {
            label:
              variantId === 'reusable-design'
                ? 'Export, try a layout and import the original file'
                : 'Arrange, rotate and undo; keep the entrance accessible',
            complete:
              done ||
              !!(variantId === 'reusable-design'
                ? a?.importedAt
                : workspace.pose && workspace.rotated && workspace.undone),
          },
          { label: 'Walk to the desk and review a saved record', complete: done },
        ],
  };
}
export function workspacePlanMarkup(room, pose, proposal) {
  const xs = room.usableFootprint.map((p) => p.x),
    zs = room.usableFootprint.map((p) => p.z),
    minX = Math.min(...xs) - 0.5,
    minZ = Math.min(...zs) - 0.5,
    width = Math.max(...xs) - minX + 0.5,
    height = Math.max(...zs) - minZ + 0.5;
  const parts = (p, color) =>
    p
      ? workspaceGeometry(room, p)
          .parts.map(
            (o) =>
              `<rect x="${o.minX}" y="${o.minZ}" width="${o.maxX - o.minX}" height="${o.maxZ - o.minZ}" fill="${color}" stroke="#14272b" stroke-width=".05"/>`
          )
          .join('')
      : '';
  return `<figure style="margin:8px 0"><svg role="img" aria-label="Overhead room plan: entrance and furniture${proposal ? ', with rejected proposal' : ''}" viewBox="${minX} ${minZ} ${width} ${height}" style="display:block;width:100%;max-height:min(230px,36dvh);background:#12282e"><polygon points="${room.usableFootprint.map((p) => `${p.x},${p.z}`).join(' ')}" fill="#cfddd7" stroke="#80b8b2" stroke-width=".1"/>${room.colliders.map((o) => `<rect x="${o.minX}" y="${o.minZ}" width="${o.maxX - o.minX}" height="${o.maxZ - o.minZ}" fill="#6a7375"/>`).join('')}${parts(proposal, '#ef9c76')}${parts(pose, '#428f85')}<circle cx="${room.entryPoint.x}" cy="${room.entryPoint.z}" r=".23" fill="#1261b4"/></svg><figcaption>Room plan · blue entrance · green furniture${proposal ? ' · orange rejected proposal' : ''}. Keep a clear route from the entrance to the desk.</figcaption></figure>`;
}
export function engineeringMarkup({
  workspace: w,
  home,
  room,
  variantId,
  button,
  record,
  reviewing,
  ready,
}) {
  let p;
  try {
    p = workspaceProjectState(w);
    if (p.schemaVersion === 1)
      for (const r of Object.values(p.reports))
        validateWorkspaceProjectReport(r, validateWorkspacePlacement);
  } catch {
    return '<p>This saved project cannot be read safely. Your layout is kept. Export your home backup before recovery.</p>';
  }
  if ((w.schemaVersion && w.schemaVersion !== 1) || p.schemaVersion !== 1)
    return '<p>This saved project needs a newer version of World Explorer. Your layout is kept.</p>';
  const a = p.active,
    report = p.reports[variantId];
  let html = `<p>${escape(WORKSPACE_PROJECTS[variantId]?.question)}</p>`;
  if (report)
    return (
      html +
      `<article class="discoveryDeliveryOffer"><strong>Saved working design</strong><p>${escape(report.title)} · ${new Date(report.completedAt).toLocaleString()}<br>Entrance route checked · record reviewed · furniture kept at its original scale.</p>${workspacePlanMarkup(report.room, report.design.pose)}</article>`
    );
  if (!a)
    return (
      html +
      `<p>${w.usedAt ? 'Your existing useful workspace remains complete. Choose a follow-up in Activities.' : 'Enter your room to inspect and arrange a useful desk.'}</p>`
    );
  html += `<ol><li>${a.inspection ? '✓ ' : ''}Inspect clearance</li><li>${a.importedAt || (w.pose && w.rotated && w.undone) ? '✓ ' : ''}${a.id === 'reusable-design' ? 'Export, try another layout, restore original file' : 'Arrange, rotate and undo'}</li><li>Walk to the desk and review the record</li></ol>`;
  if (!room) return html + '<p>Follow the route to your workspace and enter its ground floor.</p>';
  const proposal =
    a.phase === 'inspect' && a.id !== 'reusable-design' ? engineeringProposal(room) : null;
  html += workspacePlanMarkup(room, w.pose, proposal?.pose);
  if (a.phase === 'inspect')
    return (
      html +
      (proposal
        ? `<p>The orange position is rejected. Which constraint does it violate?</p><div class="discoveryPhotoActions">${[
            ['wall-clearance', 'Wall clearance'],
            ['entrance-clearance', 'Entrance access'],
            ['obstacle-overlap', 'Existing obstacle'],
            ['walking-route', 'Walking approach'],
          ]
            .map(([id, label]) => button('inspect:' + id, label))
            .join('')}</div>`
        : button('inspect:check-room-fit', 'Check the original design fits this room'))
    );
  if (!w.pose) html += button('place', 'Place desk and chair');
  else
    html += `<div class="discoveryPhotoActions">${[
      ['left', 'Nudge left'],
      ['right', 'Nudge right'],
      ['forward', 'Nudge forward'],
      ['back', 'Nudge back'],
      ['rotate', 'Turn 90°'],
      ['undo', 'Undo placement'],
      ['walk', 'Walk to your desk'],
    ]
      .map(([id, label]) => button(id, label))
      .join(
        ''
      )}</div><small>${w.rotated ? 'Rotation tried' : 'Try a rotation'} · ${w.undone ? 'Undo tried' : 'Try undo'} · ${ready ? 'Furniture ready' : 'Loading furniture…'}</small>`;
  if (a.id === 'reusable-design')
    html +=
      `<p>${!a.exported ? 'Export the original design first.' : !a.trialPose ? 'Original saved. Try another position with clear access.' : !a.importedAt ? 'New position tried. Import your original exported file.' : 'Original restored. Walk to the desk to test it.'}</p>` +
      button('export', a.exported ? 'Download original again' : 'Export original design', false) +
      `<label>Restore original design <input type="file" accept="application/json,.json" data-home-import${!a.trialPose ? ' disabled' : ''}></label>`;
  if (reviewing && record)
    html += `<article class="discoveryDeliveryOffer"><strong>${escape(record.name)}</strong><p>${escape(record.detail || record.description)}</p>${button('review', 'Review this record at the desk')}</article>`;
  return html;
}
export function workspaceReportMarkup(report) {
  try {
    if (
      !report ||
      report.schemaVersion !== 1 ||
      !WORKSPACE_PROJECTS[report.id] ||
      !report.room ||
      !report.design?.pose
    )
      return '';
    validateWorkspaceProjectReport(report, validateWorkspacePlacement);
    return `<details class="discoveryGeologyEvidence workspace-design-report"><summary>Working design · ${escape(report.title)}</summary>${workspacePlanMarkup(report.room, report.design.pose)}<p>Desk and chair at original scale · entrance route checked · saved record reviewed at the desk.</p><p>${escape(report.inspection?.diagnosis?.reason || 'Original design checked against the actual room.')}</p>${report.exported ? '<p>The original exported file was restored after a different valid trial arrangement.</p>' : ''}<small>Personal game workspace · design retained in your home save. This record keeps the layout you tested.</small></details>`;
  } catch {
    return '';
  }
}

export function validateWorkspaceJournal(events) {
  for (const event of events) {
    const r = event.metadata?.workspaceDesignReport;
    if (!r) continue;
    validateWorkspaceProjectReport(r, validateWorkspacePlacement);
    const expected = workspaceProjectEvent(
      { id: r.homeId, locationId: event.regionId, locationLabel: event.regionLabel },
      r
    );
    if (
      event.eventId !== expected.eventId ||
      event.eventType !== expected.eventType ||
      event.name !== expected.name ||
      event.occurredAt !== expected.occurredAt ||
      !events.some((e) => e.eventId === r.recordId)
    )
      throw Error('Keep the saved design with its original tested record.');
  }
}
