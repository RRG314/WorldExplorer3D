const SHIFT_SECONDS = 8 * 60 * 60;

const PRIMARY_ASSIGNMENTS = Object.freeze({
  'crew-nav': Object.freeze({ roomId: 'bridge', task: 'Plotting the local course', assignmentId: 'navigation-watch' }),
  'crew-eng': Object.freeze({ roomId: 'engineering', task: 'Monitoring propulsion and thermal control', assignmentId: 'engineering-watch' }),
  'crew-life': Object.freeze({ roomId: 'life-support', task: 'Balancing air, water, and food systems', assignmentId: 'life-support-watch' }),
  'crew-med': Object.freeze({ roomId: 'medical', task: 'Reviewing crew health', assignmentId: 'medical-watch' }),
  'crew-science': Object.freeze({ roomId: 'science', task: 'Reviewing stellar survey data', assignmentId: 'science-watch' }),
  'crew-flight': Object.freeze({ roomId: 'bridge', task: 'Holding the flight watch', assignmentId: 'flight-watch' }),
  'crew-systems': Object.freeze({ roomId: 'cargo-fabrication', task: 'Checking stores and fabrication queues', assignmentId: 'systems-watch' })
});

const SUPPORT_ASSIGNMENTS = Object.freeze([
  Object.freeze({ roomId: 'life-support', task: 'Completing a routine systems round', assignmentId: 'systems-round' }),
  Object.freeze({ roomId: 'cargo-fabrication', task: 'Inspecting mission stores', assignmentId: 'stores-round' }),
  Object.freeze({ roomId: 'science', task: 'Reviewing observation records', assignmentId: 'science-support' })
]);

function freezeOperation(operation) {
  return Object.freeze({ ...operation });
}

function emergencyAssignment(member, pendingEvent) {
  const roles = new Set(member?.roles || []);
  if (pendingEvent?.kind === 'maintenance' && roles.has('engineering')) {
    return freezeOperation({
      status: 'responding', roomId: 'engineering', task: 'Responding to the thermal-control warning', assignmentId: 'thermal-response'
    });
  }
  if (pendingEvent?.kind === 'maintenance' && (roles.has('medical') || roles.has('life-support'))) {
    return freezeOperation({
      status: 'supporting', roomId: roles.has('medical') ? 'medical' : 'life-support', task: 'Monitoring crew and life-support margins', assignmentId: 'maintenance-support'
    });
  }
  if (pendingEvent?.kind === 'discovery' && roles.has('science')) {
    return freezeOperation({
      status: 'responding', roomId: 'science', task: 'Characterizing the detected object', assignmentId: 'discovery-response'
    });
  }
  return null;
}

function deriveCrewOperations(expedition) {
  const elapsed = Math.max(0, Number(expedition?.strategicElapsedS) || 0);
  const shiftIndex = Math.floor(elapsed / SHIFT_SECONDS);
  const visibleCrew = (expedition?.crew || []).filter((member) => member?.id !== 'player' && member?.status !== 'dead');
  return Object.freeze(visibleCrew.map((member, index) => {
    const emergency = emergencyAssignment(member, expedition?.pendingEvent);
    if (emergency) return freezeOperation({ crewId: member.id, crewName: member.name, ...emergency });
    const phase = (shiftIndex + index) % 3;
    if (phase === 2) {
      return freezeOperation({
        crewId: member.id,
        crewName: member.name,
        status: 'resting',
        roomId: 'quarters',
        task: 'Off shift',
        assignmentId: 'crew-rest'
      });
    }
    if (phase === 1) {
      const support = SUPPORT_ASSIGNMENTS[index % SUPPORT_ASSIGNMENTS.length];
      return freezeOperation({ crewId: member.id, crewName: member.name, status: 'supporting', ...support });
    }
    const primary = PRIMARY_ASSIGNMENTS[member.id] || Object.freeze({
      roomId: 'bridge', task: 'Standing the general watch', assignmentId: 'general-watch'
    });
    return freezeOperation({ crewId: member.id, crewName: member.name, status: 'working', ...primary });
  }));
}

function summarizeCrewOperations(operations = []) {
  const counts = { working: 0, supporting: 0, responding: 0, resting: 0 };
  for (const operation of operations) {
    if (Object.hasOwn(counts, operation?.status)) counts[operation.status] += 1;
  }
  return Object.freeze({
    ...counts,
    active: counts.working + counts.supporting + counts.responding,
    total: operations.length
  });
}

export { deriveCrewOperations, PRIMARY_ASSIGNMENTS, SHIFT_SECONDS, summarizeCrewOperations };
