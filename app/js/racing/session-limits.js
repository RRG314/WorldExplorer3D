// One bounded policy for the session owner, Journal readers and career receipt
// finalization. Longer courses must not inherit a ten-minute city-run deadline.
export const RACE_MINIMUM_DURATION_MS=600000;
export const RACE_MAXIMUM_DURATION_MS=2700000;
export const RACE_MAXIMUM_EVENT_DISTANCE_METERS=64000;
export function raceMaximumDurationMs(course){
 const length=course?.lengthMeters,laps=course?.laps;
 if(!Number.isFinite(length)||length<200||length>30000||!Number.isInteger(laps)||laps<1||laps>8||length*laps>RACE_MAXIMUM_EVENT_DISTANCE_METERS)throw Error('invalid_race_duration_course');
 // Ten metres/second plus two minutes of recovery, rounded to a whole minute.
 // Short city events retain their existing ten-minute allowance. The absolute
 // 45-minute bound fits the existing one-hour service connection lifecycle.
 return Math.max(RACE_MINIMUM_DURATION_MS,Math.min(RACE_MAXIMUM_DURATION_MS,Math.ceil((length*laps/10+120)/60)*60000+(course.discipline==='rally'?90000:0)));
}
