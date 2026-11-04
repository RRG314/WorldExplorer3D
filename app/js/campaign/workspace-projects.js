// Bounded extensions of the existing workspace record. The housing owner still
// owns every layout write; the original placement validator is supplied by it.
import { canonicalFieldRecord } from './field-study-contract.js';
export const WORKSPACE_PROJECTS = Object.freeze({
  campaign: {
    id: 'campaign',
    label: 'Make a Useful Place',
    question:
      'Arrange a reachable Journal desk, try rotation and undo, then use your saved record.',
  },
  'room-to-work': {
    id: 'room-to-work',
    label: 'Room to Work',
    question:
      'Diagnose a rejected position, rearrange the workspace and keep its entrance and working approach clear.',
  },
  'reusable-design': {
    id: 'reusable-design',
    label: 'A Reusable Workspace',
    question:
      'Export a working design, try another arrangement, restore the original file and check that it still works in this room.',
  },
});
const clock = (now) => {
  if (!Number.isFinite(now) || now <= 0) throw Error('Use a valid workspace save time.');
};
const copy = (v) => structuredClone(v),
  same = (a, b) => canonicalFieldRecord(a) === canonicalFieldRecord(b),
  finite = (p) =>
    p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.z) &&
    Math.abs(p.x) <= 100 &&
    Math.abs(p.z) <= 100;
export function workspaceProjectState(workspace) {
  const p = workspace?.projects;
  if (!p) return { schemaVersion: 1, active: null, reports: {} };
  if (p.schemaVersion !== 1) return copy(p);
  if (
    !p.reports ||
    typeof p.reports !== 'object' ||
    Array.isArray(p.reports) ||
    Object.keys(p.reports).some((id) => !Object.hasOwn(WORKSPACE_PROJECTS, id)) ||
    (p.active && !Object.hasOwn(WORKSPACE_PROJECTS, p.active.id))
  )
    throw Error(
      'This saved workspace project cannot be read safely. Export your existing home data before recovery.'
    );
  return copy(p);
}
export function workspaceDesign(workspace) {
  if (
    !finite(workspace?.pose) ||
    ![0, 1, 2, 3].includes(workspace.pose.turn) ||
    !['journal', 'album'].includes(workspace.purpose)
  )
    throw Error('Place a supported workspace before saving a design.');
  return {
    format: 'world-explorer-workspace',
    schemaVersion: 1,
    purpose: workspace.purpose,
    pose: copy(workspace.pose),
    assets: ['workspace-table', 'workspace-chair'],
  };
}
function roomRecord(input) {
  if (
    !input ||
    typeof input.homeId !== 'string' ||
    !input.homeId ||
    input.homeId.length > 180 ||
    typeof input.sourceBuildingId !== 'string' ||
    !input.sourceBuildingId ||
    !Number.isFinite(input.metersPerUnit) ||
    input.metersPerUnit <= 0 ||
    input.metersPerUnit > 10 ||
    !Array.isArray(input.usableFootprint) ||
    input.usableFootprint.length < 3 ||
    input.usableFootprint.length > 128 ||
    !input.usableFootprint.every(finite) ||
    !finite(input.entryPoint) ||
    !Array.isArray(input.colliders) ||
    input.colliders.length > 256 ||
    input.colliders.some(
      (c) =>
        !['minX', 'maxX', 'minZ', 'maxZ', 'minY', 'maxY'].every(
          (k) => Number.isFinite(c[k]) && Math.abs(c[k]) <= 200
        )
    )
  )
    throw Error('Inspect the actual supported room before starting this project.');
  return {
    homeId: input.homeId,
    sourceBuildingId: input.sourceBuildingId,
    metersPerUnit: input.metersPerUnit,
    center: { x: 0, z: 0 },
    floorBaseY: 0,
    activeLevel: 0,
    entryPoint: copy(input.entryPoint),
    usableFootprint: copy(input.usableFootprint),
    colliders: copy(input.colliders),
  };
}
export function workspaceConstraint(reason) {
  if (/walls/.test(reason)) return 'wall-clearance';
  if (/entrance/.test(reason)) return 'entrance-clearance';
  if (/overlap/.test(reason)) return 'obstacle-overlap';
  if (/walking route/.test(reason)) return 'walking-route';
  return 'unsupported';
}
export function beginWorkspaceProject(workspace, id, now) {
  clock(now);
  if (!Object.hasOwn(WORKSPACE_PROJECTS, id)) throw Error('Choose an available workspace project.');
  const p = workspaceProjectState(workspace);
  if (p.schemaVersion !== 1)
    throw Error('This workspace project needs a newer World Explorer version.');
  if (p.active) {
    if (p.active.id !== id) throw Error('Finish the current workspace project first.');
    return p;
  }
  if (p.reports[id]) return p;
  if (
    id !== 'campaign' &&
    !(
      (workspace.pose && workspace.rotated && workspace.undone && workspace.usedAt > 0) ||
      p.reports.campaign
    )
  )
    throw Error('Finish a useful workspace before choosing a follow-up project.');
  p.active = {
    id,
    startedAt: now,
    phase: 'inspect',
    startingPose: workspace.pose ? copy(workspace.pose) : null,
    startingRevision: workspace.revision,
  };
  return p;
}
export function inspectWorkspaceProject(workspace, command, now, validatePlacement) {
  clock(now);
  const p = workspaceProjectState(workspace),
    a = p.active;
  if (p.schemaVersion !== 1 || !a || a.phase !== 'inspect')
    throw Error('Choose the current workspace inspection.');
  const room = roomRecord(command.room);
  let diagnosis = null;
  if (a.id === 'reusable-design') {
    if (
      command.decision !== 'check-room-fit' ||
      !validatePlacement(room, workspace.pose, room.colliders).ok
    )
      throw Error('Check that the original design fits this actual room before reusing it.');
  } else {
    const proposal = command.proposal;
    if (!finite(proposal) || ![0, 1, 2, 3].includes(proposal.turn))
      throw Error('Check a concrete proposed furniture position.');
    const result = validatePlacement(room, proposal, room.colliders),
      constraint = workspaceConstraint(result.reason || '');
    if (result.ok || constraint === 'unsupported' || command.decision !== constraint)
      throw Error('Identify the actual clearance problem in the proposed position.');
    diagnosis = { proposal: copy(proposal), constraint, reason: result.reason };
  }
  a.inspection = { room, diagnosis, decision: command.decision, at: now };
  a.phase = 'arrange';
  return p;
}
export function exportWorkspaceProject(workspace, now) {
  clock(now);
  const p = workspaceProjectState(workspace),
    a = p.active;
  if (p.schemaVersion !== 1 || a?.id !== 'reusable-design' || a.phase !== 'arrange')
    throw Error('Inspect the reusable-design project first.');
  if (a.exported) throw Error('Keep the original exported design for this project.');
  a.exported = { design: workspaceDesign(workspace), at: now };
  return p;
}
export function workspaceProjectEdit(previous, next, command, now) {
  clock(now);
  if (!previous.projects) return undefined;
  const p = workspaceProjectState(previous);
  if (p.schemaVersion !== 1)
    throw Error('This workspace project needs a newer World Explorer version.');
  const a = p.active;
  if (!a || a.phase !== 'arrange') return p;
  if (a.id === 'reusable-design' && a.exported) {
    if (command.projectAction === 'import') {
      if (
        !a.trialPose ||
        !same(command.importedDesign, a.exported.design) ||
        !same(workspaceDesign(next), a.exported.design)
      )
        throw Error('Try a different layout, then import this project’s original exported design.');
      a.importedAt = now;
    } else if (next.pose && !same(next.pose, a.exported.design.pose)) {
      a.trialPose = { pose: copy(next.pose), at: now };
      a.importedAt = null;
    }
  }
  return p;
}
export function finishWorkspaceProject(previous, next, command, now, validatePlacement) {
  clock(now);
  const p = workspaceProjectState(previous),
    a = p.active;
  if (p.schemaVersion !== 1 || !a) return previous.projects;
  if (a.phase !== 'arrange' || !a.inspection)
    throw Error('Inspect the room before testing your arrangement.');
  const room = roomRecord(command.projectUse?.room),
    prior = a.inspection.room,
    use = command.projectUse;
  if (
    room.homeId !== prior.homeId ||
    room.sourceBuildingId !== prior.sourceBuildingId ||
    !same(room.usableFootprint, prior.usableFootprint) ||
    !same(room.entryPoint, prior.entryPoint)
  )
    throw Error('Test the design in its original inspected room.');
  const checked = validatePlacement(room, next.pose, room.colliders),
    position = use?.position;
  if (!checked.ok) throw Error(checked.reason);
  if (
    !finite(position) ||
    use.supported !== true ||
    use.travelMode !== 'walk' ||
    use.liveGps ||
    !Number.isFinite(use.feetY) ||
    Math.abs(use.feetY - checked.geometry.use.y) > 0.8 ||
    Math.hypot(position.x - checked.geometry.use.x, position.z - checked.geometry.use.z) >= 1.4 ||
    typeof use.recordId !== 'string' ||
    !use.recordId ||
    use.recordId.length > 200
  )
    throw Error('Walk beside the working desk and review an actual saved record.');
  if (
    a.id === 'room-to-work' &&
    (!a.startingPose ||
      (Math.hypot(next.pose.x - a.startingPose.x, next.pose.z - a.startingPose.z) < 0.49 &&
        next.pose.turn === a.startingPose.turn))
  )
    throw Error('Make a useful change to the arrangement before testing it.');
  if (
    a.id === 'reusable-design' &&
    (!a.exported ||
      !a.trialPose ||
      !a.importedAt ||
      !same(workspaceDesign(next), a.exported.design))
  )
    throw Error('Export, try another position and import the original design before testing it.');
  p.reports[a.id] = {
    schemaVersion: 1,
    id: a.id,
    title: WORKSPACE_PROJECTS[a.id].label,
    truthType: 'used-personal-workspace-design',
    homeId: room.homeId,
    sourceBuildingId: room.sourceBuildingId,
    startedAt: a.startedAt,
    completedAt: now,
    startingPose: copy(a.startingPose),
    startingRevision: a.startingRevision,
    rotationTried: next.rotated === true,
    undoTried: next.undone === true,
    inspection: copy(a.inspection),
    design: workspaceDesign(next),
    workspaceRevision: next.revision,
    recordId: use.recordId,
    use: { position: copy(position), feetY: use.feetY, supported: true },
    room,
    routeChecked: true,
    ...(a.exported
      ? { exported: copy(a.exported), trialPose: copy(a.trialPose), importedAt: a.importedAt }
      : {}),
  };
  p.active = null;
  return p;
}

export function validateWorkspaceProjectReport(report, validatePlacement) {
  if (
    !report ||
    report.schemaVersion !== 1 ||
    !Object.hasOwn(WORKSPACE_PROJECTS, report.id) ||
    report.title !== WORKSPACE_PROJECTS[report.id].label ||
    report.truthType !== 'used-personal-workspace-design' ||
    !report.routeChecked ||
    !report.rotationTried ||
    !report.undoTried ||
    !Number.isSafeInteger(report.workspaceRevision) ||
    report.workspaceRevision < 1 ||
    !Number.isSafeInteger(report.startingRevision) ||
    report.startingRevision < 0 ||
    report.workspaceRevision <= report.startingRevision
  )
    throw Error('This saved working design is inconsistent.');
  const r = roomRecord(report.room),
    i = report.inspection;
  if (
    r.homeId !== report.homeId ||
    r.sourceBuildingId !== report.sourceBuildingId ||
    !i ||
    !(report.startedAt > 0 && i.at >= report.startedAt && report.completedAt >= i.at)
  )
    throw Error('Keep the original room inspection and accepted project times.');
  const active = {
    id: report.id,
    startedAt: report.startedAt,
    startingPose: copy(report.startingPose),
    startingRevision: report.startingRevision,
    phase: 'inspect',
  };
  let previous = {
    revision: report.workspaceRevision - 1,
    ...report.design,
    pose: copy(report.startingPose),
    projects: { schemaVersion: 1, active, reports: {} },
  };
  previous.projects = inspectWorkspaceProject(
    previous,
    { room: i.room, proposal: i.diagnosis?.proposal, decision: i.decision },
    i.at,
    validatePlacement
  );
  if (!same(previous.projects.active.inspection, i))
    throw Error('The saved clearance diagnosis does not match the actual proposed position.');
  if (report.exported) {
    const x = report.exported,
      t = report.trialPose;
    if (
      !(
        x.at >= i.at &&
        t?.at >= x.at &&
        report.importedAt >= t.at &&
        report.completedAt >= report.importedAt
      ) ||
      same(t.pose, x.design.pose) ||
      !validatePlacement(i.room, x.design.pose, i.room.colliders).ok ||
      !validatePlacement(i.room, t.pose, i.room.colliders).ok ||
      !same(workspaceDesign({ ...x.design }), x.design)
    )
      throw Error('Keep the original file and valid distinct trial.');
    Object.assign(previous.projects.active, {
      exported: copy(x),
      trialPose: copy(t),
      importedAt: report.importedAt,
    });
  }
  const next = {
    ...previous,
    ...report.design,
    revision: report.workspaceRevision,
    rotated: true,
    undone: true,
  };
  const projects = finishWorkspaceProject(
    previous,
    next,
    {
      projectUse: {
        room: r,
        ...report.use,
        travelMode: 'walk',
        liveGps: false,
        recordId: report.recordId,
      },
    },
    report.completedAt,
    validatePlacement
  );
  if (!same(projects.reports[report.id], report))
    throw Error('This saved design differs from its recorded inspection and test.');
  return copy(report);
}
