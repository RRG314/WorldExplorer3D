// Event rules travel with the existing course identity. Missing rules identify
// historical courses; their records retain the handling used to earn them.
export const RACE_CONTACT_RULES=Object.freeze({version:1,damage:'standard'});
export function normalizeRaceEventRules(value){
 if(value==null)return null;
 if(value.version!==1||value.damage!=='standard'||Object.keys(value).some(k=>!['version','damage'].includes(k)))throw Error('invalid_race_event_rules');
 return {...RACE_CONTACT_RULES};
}
export const raceHasDamage=course=>course?.discipline==='rally'||course?.eventRules?.version===1&&course.eventRules.damage==='standard';
