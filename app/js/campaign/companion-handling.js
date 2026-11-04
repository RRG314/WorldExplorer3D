import { awardCompanionXp } from '../discovery/companions.js?v=7';
export const recallMemoryId = (id) => `event:companion:training:${id}:recall`;
export function companionRecallOutcome(current, completedAt, context = {}) {
  if (!current || current.schemaVersion !== 3 || current.progression?.schemaVersion !== 3)
    throw Error(
      'This companion needs a newer version of World Explorer. Its saved record is kept.'
    );
  if (!current.active || current.progression.level < 2)
    throw Error('Take this level 2 companion with you before saving recall practice.');
  if (!Number.isFinite(completedAt) || completedAt <= 0)
    throw Error('Recall practice needs its original completion time.');
  const old = current.training?.records?.recall,
    record =
      old?.completed && Number.isFinite(old.completedAt) && old.completedAt > 0
        ? old
        : { completed: true, completedAt },
    training = {
      ...current.training,
      learnedCommands: [
        ...new Set([...(current.training?.learnedCommands || ['follow']), 'recall']),
      ],
      records: { ...current.training?.records, recall: record },
    },
    award = awardCompanionXp(
      { ...current, training },
      {
        receiptId: `training:${current.instanceId}:recall:first-clear`,
        reasonId: 'training-first-clear',
        awardedAt: completedAt,
      }
    );
  return {
    ...award,
    event: {
      eventId: recallMemoryId(current.instanceId),
      eventType: 'companion-training',
      sourceSystem: 'companions',
      sourceId: current.instanceId,
      pathId: 'companion',
      name: `${current.name} learned Recall`,
      detail: 'Your companion returned when called. Recall is saved.',
      occurredAt: completedAt,
      firstCompletion: true,
      points: 0,
      progressReason: 'companion-memory',
      ...(context.regionId
        ? {
            regionId: String(context.regionId).slice(0, 260),
            regionLabel: String(context.regionLabel || 'Your place').slice(0, 120),
            environment: 'EARTH',
            ...(context.locationSnapshot
              ? { locationSnapshot: structuredClone(context.locationSnapshot) }
              : {}),
          }
        : {}),
      metadata: {
        companionRecall: {
          schemaVersion: 1,
          instanceId: current.instanceId,
          catalogId: current.catalogId,
          completedAt: record.completedAt,
        },
      },
    },
  };
}
export function validateCompanionRecallBackup(companions = [], events = []) {
  for (const event of events) {
    const proof = event.metadata?.companionRecall;
    if (!proof || proof.schemaVersion > 1) continue;
    const c = companions.find((c) => c.instanceId === proof.instanceId);
    if (
      proof.schemaVersion !== 1 ||
      !Number.isFinite(proof.completedAt) ||
      proof.completedAt <= 0 ||
      event.sourceId !== proof.instanceId ||
      event.eventId !== recallMemoryId(proof.instanceId) ||
      event.sourceSystem !== 'companions' ||
      event.eventType !== 'companion-training' ||
      c?.catalogId !== proof.catalogId ||
      c.training?.records?.recall?.completed !== true ||
      c.training.records.recall.completedAt !== proof.completedAt ||
      !c.training.learnedCommands?.includes('recall')
    )
      throw Error('Keep the recall memory with its original companion and saved skill.');
  }
}
export function companionHandlingView(snapshot = {}) {
  const owned = snapshot.companions || [],
    c = owned.find((c) => c.active) || owned[0],
    exercise = snapshot.exercise || {};
  return {
    title: 'Exploring Together',
    companion: c || null,
    exercise,
    next: !c
      ? 'Meet your first companion'
      : !c.active
        ? 'Travel together'
        : !c.care?.lastInteractionAt
          ? 'Care for your companion'
          : !c.training?.learnedCommands?.includes('recall')
            ? c.progression?.level >= 2
              ? 'Practice Recall'
              : 'Make a field record together'
            : 'Explore a field lead together',
    summary: c
      ? `${c.name} · level ${c.progression?.level || 1} · ${c.progression?.trustState || 'Comfortable'}. Care, practise a supported skill and choose where your companion rests.`
      : 'Your first dog is included. Owned virtual companions keep their names, care, skills and resting places.',
  };
}

const escape = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
export function companionHandlingMarkup(snapshot) {
  const v = companionHandlingView(snapshot),
    c = v.companion,
    e = v.exercise;
  return `<strong>Next · ${escape(v.next)}</strong><p>${escape(v.summary)}</p><details><summary>Care, skills and costs</summary><p>Petting or grooming and Recall practice cost no credits or supplies. Care after an outing can earn one care award per day. Meaningful field records and new places build companion XP and trust; level 2 opens Recall practice. The first clear saves Recall and its Companion XP once.</p><p>Your Companion Handling practice improves greeting cues and calm-wait timing. A companion rests at its assigned home, or safely with the care network until a home is chosen. Use Travel together to bring it back.</p></details>${e.active ? `<p role="status">${escape(e.message || (e.phase === 'move-away' ? 'Your companion is waiting. Walk at least 6 m away, then use Call.' : e.phase === 'returning' ? 'Wait for your companion to return.' : e.phase === 'saving' ? 'Saving Recall practice…' : 'Practice is ready.'))}</p>${e.phase === 'save-failed' ? '<button type="button" data-companion-brief="retry">Retry completed practice</button>' : ''}` : ''}${c?.training?.learnedCommands?.includes('recall') ? '<p>Recall saved. Practise again whenever you like; the first-clear award stays once-only.</p><button type="button" data-companion-brief="field">Go exploring together</button>' : ''}<button type="button" data-companion-brief="activities">Activities · choose a journey</button>`;
}
