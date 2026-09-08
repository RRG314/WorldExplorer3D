const EXPEDITION_CAMPAIGN_VERSION = 1;

const CAMPAIGN_PHASE = Object.freeze({
  PREPARATION: 'preparation',
  TRANSIT: 'interstellar-transit',
  ARRIVAL: 'destination-arrival',
  OPERATIONS: 'destination-operations',
  ANALYSIS: 'shipboard-analysis',
  COMPLETE: 'mission-complete',
  FAILED: 'mission-failed'
});

const CAMPAIGN_MISSION_BY_DESTINATION = Object.freeze({
  'proxima-centauri': 'proxima-centauri-b'
});

function campaignMissionDestinationId(destinationId) {
  const id = String(destinationId || '');
  return CAMPAIGN_MISSION_BY_DESTINATION[id] || id;
}

function campaignPhase(expedition, destinationMission = null, currentFrameId = '') {
  if (!expedition) return CAMPAIGN_PHASE.PREPARATION;
  if (expedition.state === 'failed') return CAMPAIGN_PHASE.FAILED;
  if (expedition.state === 'completed') return CAMPAIGN_PHASE.COMPLETE;
  if (expedition.state === 'planned') return CAMPAIGN_PHASE.PREPARATION;
  if (expedition.state === 'traveling') return CAMPAIGN_PHASE.TRANSIT;
  if (destinationMission?.phase === 'analysis') return CAMPAIGN_PHASE.ANALYSIS;
  if (destinationMission && ['approach', 'fieldwork'].includes(destinationMission.phase)) return CAMPAIGN_PHASE.OPERATIONS;
  if (expedition.state === 'arrived' && String(currentFrameId || '') === String(expedition.destinationId || '')) {
    return CAMPAIGN_PHASE.OPERATIONS;
  }
  return CAMPAIGN_PHASE.ARRIVAL;
}

function campaignObjective(expedition, destinationMission = null, currentFrameId = '') {
  const phase = campaignPhase(expedition, destinationMission, currentFrameId);
  if (phase === CAMPAIGN_PHASE.PREPARATION) return 'Assess the crew, ship, and reserves, then depart from Sol.';
  if (phase === CAMPAIGN_PHASE.TRANSIT) {
    if (expedition?.pendingEvent) return `Respond aboard ${expedition.ship?.name || 'Solis Reach'} in ${String(expedition.pendingEvent.roomId || 'the affected room').replaceAll('-', ' ')}.`;
    return 'Advance the next watch while protecting crew health, ship systems, and arrival reserves.';
  }
  if (phase === CAMPAIGN_PHASE.ARRIVAL) return `Complete final approach and enter ${String(expedition?.destinationId || 'the destination').replaceAll('-', ' ')}.`;
  if (phase === CAMPAIGN_PHASE.ANALYSIS) return destinationMission?.currentObjective || 'Return the evidence to Solis Reach and publish the expedition report.';
  if (phase === CAMPAIGN_PHASE.OPERATIONS) return destinationMission?.currentObjective || 'Begin the required destination science mission.';
  if (phase === CAMPAIGN_PHASE.COMPLETE) return 'Mission accomplished. Review the voyage result or plan another expedition.';
  return expedition?.failureReport?.summary || 'Review the mission-loss report and explicitly prepare a new expedition.';
}

function completeCampaign(expedition, missionResult = {}, atMs = Date.now()) {
  if (!expedition || expedition.state === 'failed') return expedition;
  const completedAtMs = Number(atMs) || Date.now();
  const points = Math.max(0, Number(missionResult.points) || 0);
  return Object.freeze({
    ...expedition,
    state: 'completed',
    voyagePhase: 'mission-complete',
    campaignVersion: EXPEDITION_CAMPAIGN_VERSION,
    campaignCompletedAtMs: completedAtMs,
    updatedAtMs: completedAtMs,
    campaignResult: Object.freeze({
      missionId: String(missionResult.missionId || ''),
      destinationId: String(missionResult.destinationId || campaignMissionDestinationId(expedition.destinationId)),
      title: String(missionResult.title || 'First Light Expedition'),
      outcomeId: String(missionResult.outcomeId || 'cautious-baseline'),
      outcomeLabel: String(missionResult.outcomeLabel || 'Science report published'),
      sciencePoints: points,
      voyagePoints: 100,
      totalPoints: points + 100
    }),
    log: Object.freeze([...(expedition.log || []), Object.freeze({
      atMissionS: Number(expedition.calculation?.properElapsedS || expedition.strategicElapsedS) || 0,
      kind: 'mission-complete',
      message: `${String(missionResult.title || 'Destination mission')} completed. The First Light expedition report was transmitted.`
    })])
  });
}

export {
  campaignMissionDestinationId,
  campaignObjective,
  campaignPhase,
  CAMPAIGN_PHASE,
  completeCampaign,
  EXPEDITION_CAMPAIGN_VERSION
};
