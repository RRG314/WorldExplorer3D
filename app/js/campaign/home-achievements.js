export const HOME_ACHIEVEMENTS=Object.freeze({
  maker:{id:'useful-place',label:'Maker',detail:'Arranged a reachable workspace, tried rotation and undo, then used it to review a saved record.'},
  home:{id:'place-to-return',label:'A Place to Return',detail:'Entered a personal base, displayed a record, set a return destination and returned after an outing.'}
});
export function homeAchievementEvent(kind,home,profile) {
  const definition=HOME_ACHIEVEMENTS[kind];
  if (!definition || !home?.id || profile?.openingChapter?.phase!=='complete') throw Error('Finish First Bearings before completing this chapter.');
  const workspace=home.workspace,journey=home.journey||{};
  const complete=kind==='maker'?workspace?.schemaVersion===1&&workspace.pose&&workspace.rotated&&workspace.undone&&workspace.usedAt>0
    :['entered','displayed','departed','returned'].every(key=>journey[key]>0)&&!!(profile.harborRun?.phase==='complete'||profile.threeViews?.phase==='complete'||profile.homeAchievements?.maker);
  if (!complete) throw Error('Finish the chapter steps at your personal workspace first.');
  return {eventId:`event:campaign:${definition.id}:v1`,eventType:'campaign-completed',sourceSystem:'explorer-campaign',sourceId:definition.id,pathId:'creation',
    name:definition.label,detail:definition.detail,occurredAt:kind==='maker'?workspace.usedAt:journey.returned,
    regionId:home.locationId,regionLabel:home.locationLabel,environment:'EARTH',points:0,projections:{profile:false,place:false},
    metadata:{chapterId:definition.id,homeId:home.id,purpose:workspace?.purpose||'journal'}};
}
export function homeAchievementBadges(profile) {
  return Object.entries(HOME_ACHIEVEMENTS).flatMap(([kind,definition])=>{
    const event=profile?.homeAchievements?.[kind];
    return event?.eventId===`event:campaign:${definition.id}:v1`&&event.occurredAt>0?[{...definition,earnedAt:event.occurredAt,eventId:event.eventId}]:[];
  });
}
