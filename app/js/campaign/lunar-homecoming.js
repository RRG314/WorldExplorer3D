import { lunarFieldPlan, LUNAR_STRATEGIES } from '../planetary/lunar-survey.js';
import { coastalDepartureState, coastalEventIds } from './coastal-departure.js';
import { investigationState, investigationEventIds } from './coastal-investigation.js';
import { homeAchievementBadges } from './home-achievements.js';

export const LUNAR_REPORT_ID = 'event:destination-mission:moon';
export const LUNAR_DISPLAY_ID = 'event:campaign:lunar-homecoming:v1';
export const HARBOR_COMPLETE_ID = 'event:campaign:from-the-harbor:v1';
export const harborJourneyEventIds = Object.freeze([...coastalEventIds, ...investigationEventIds, LUNAR_REPORT_ID, LUNAR_DISPLAY_ID, HARBOR_COMPLETE_ID]);

export function lunarReport(events = []) {
  const event = events.find(entry => entry.eventId === LUNAR_REPORT_ID), m = event?.metadata;
  if (event?.sourceSystem !== 'destination-missions' || event.eventType !== 'destination-mission-complete'
    || !(event.occurredAt > 0) || m?.lunarVersion !== 1 || m.truthType !== 'authored' || m.missionId !== 'mission:moon'
    || !LUNAR_STRATEGIES.some(entry => entry.id === m.strategy) || !m.podId || !m.expeditionId
    || !Array.isArray(m.fieldEvidence) || !lunarFieldPlan(m.strategy).every(entry => m.fieldEvidence.includes(entry.evidenceId))) return null;
  return event;
}

export function harborJourneyState(profile = {}, events = []) {
  const report = lunarReport(events), coast = coastalDepartureState(events), investigation = investigationState(events);
  const home = homeAchievementBadges(profile).some(badge => badge.id === 'place-to-return');
  const branch = profile.harborRun?.phase === 'complete' ? 'Delivery route' : profile.threeViews?.phase === 'complete' ? 'Three Views' : homeAchievementBadges(profile).some(badge => badge.id === 'useful-place') ? 'Maker workspace' : null;
  const display = events.find(event => event.eventId === LUNAR_DISPLAY_ID && event.sourceSystem === 'explorer-campaign'
    && event.eventType === 'campaign-completed' && event.environment === 'EARTH' && event.occurredAt >= report?.occurredAt
    && event.metadata?.reportId === report?.eventId && event.metadata?.homeId && event.metadata?.podId === report?.metadata?.podId);
  const steps = [
    { id:'bearings', label:'First Bearings', complete:profile.openingChapter?.phase === 'complete', decision:profile.openingChapter?.careerId || 'Choose an explorer and make a field record' },
    { id:'branch', label:'Your first local journey', complete:!!branch, decision:branch || 'Finish a delivery, Three Views or a useful workspace' },
    { id:'home', label:'A Place to Return', complete:home, decision:home ? 'Personal base established' : 'Arrange your base, leave and return' },
    { id:'coastal', label:'Coastal Departure', complete:coast.completed, decision:coast.site?.name || 'Plan and deploy from the research vessel' },
    { id:'investigation', label:'What the Coast Revealed', complete:investigation.completed, decision:investigation.selected ? `Investigated ${investigation.selected}` : 'Chart, dive, return and explain a seabed contact' },
    { id:'preparation', label:'Preparing for Another World', complete:report?.metadata?.prepared === true, decision:report ? LUNAR_STRATEGIES.find(entry=>entry.id===report.metadata.strategy).label : 'Prepare the field kit aboard Solis Reach' },
    { id:'moon', label:'A Different Kind of Shore', complete:!!report, decision:report ? 'Two-site comparison returned in Pathfinder' : 'Compare both lunar sites and file the ship report' },
    { id:'return', label:'Bring the Journey Home', complete:!!display, decision:display ? 'Lunar field book displayed at your Earth base' : 'Return to Earth and review the lunar report at your desk' }
  ];
  const ready = steps.every(step => step.complete);
  const completion = events.find(event => event.eventId === HARBOR_COMPLETE_ID && event.sourceSystem === 'explorer-campaign'
    && event.eventType === 'campaign-completed' && event.metadata?.displayId === display?.eventId
    && event.metadata?.homeId === display?.metadata?.homeId && event.occurredAt >= display?.occurredAt);
  return { report, display, steps, ready, complete:ready && !!completion, completion:ready ? completion : null };
}

export function lunarHomecomingRecord(home, report, now = Date.now()) {
  if (!home?.id || home.workspace?.recordId !== LUNAR_REPORT_ID || !lunarReport([report]) || now < report.occurredAt) throw Error('Display the completed lunar field book at your Earth workspace first.');
  return { eventId:LUNAR_DISPLAY_ID, eventType:'campaign-completed', sourceSystem:'explorer-campaign', sourceId:'lunar-homecoming', pathId:'creation',
    name:'Bring the Journey Home', detail:'Returned to an Earth workspace and reviewed the two-site lunar field record at the desk.', occurredAt:now,
    environment:'EARTH', regionId:home.locationId, regionLabel:home.locationLabel, points:0, projections:{journal:true,profile:false,place:false},
    metadata:{homeId:home.id,reportId:report.eventId,podId:report.metadata.podId,truthType:'authored'} };
}
export function harborCompletionRecord(profile, events, now = Date.now()) {
  const journey=harborJourneyState(profile,events);
  if (!journey.ready || now < journey.display.occurredAt) throw Error('Finish the remaining journeys before recording the full campaign.');
  return {eventId:HARBOR_COMPLETE_ID,eventType:'campaign-completed',sourceSystem:'explorer-campaign',sourceId:'from-the-harbor',pathId:'travel',name:'From the Harbor',
    detail:'Completed a local journey, established a base, investigated the coast, compared lunar sites and brought the field record home.',occurredAt:now,environment:'EARTH',points:0,
    projections:{journal:true,profile:false,place:false},metadata:{displayId:journey.display.eventId,homeId:journey.display.metadata.homeId,truthType:'authored',decisions:journey.steps.map(step=>({id:step.id,decision:step.decision}))}};
}
export function lunarCampaignBadges(profile,events) {
  const journey=harborJourneyState(profile,events);
  return [journey.report?{id:'lunar-surveyor',label:'Lunar Surveyor',detail:'Compared two lunar sites and recovered the field record to the ship lab.',earnedAt:journey.report.occurredAt}:null,
    journey.complete?{id:'from-the-harbor',label:'From the Harbor',detail:'Brought a complete local, coastal and lunar journey home.',earnedAt:journey.completion.occurredAt}:null].filter(Boolean);
}
export function validateLunarHomecomingBackup(profile,events) {
  const journey=harborJourneyState(profile,events);
  if (events.some(event=>event.eventId===LUNAR_REPORT_ID&&event.metadata?.lunarVersion!=null)&&!journey.report) throw Error('Invalid lunar report');
  if (events.some(event=>event.eventId===LUNAR_DISPLAY_ID)&&!journey.display) throw Error('Invalid lunar homecoming');
  if (events.some(event=>event.eventId===HARBOR_COMPLETE_ID)&&!journey.complete) throw Error('Incomplete campaign evidence');
}
