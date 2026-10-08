export function sceneBudgetFailures(sample, budget) {
 const failures=[];
 for(const [key,limit] of Object.entries(budget.maximum)) {
  const actual=sample.after?.resources?.[key];
  if(!Number.isFinite(actual)||actual<0||actual>limit)failures.push(`${sample.id}.${key}: ${actual} exceeds or cannot establish ${limit}`);
 }
 for(const [key,limit] of Object.entries(budget.colliders||{})) {
  const actual=sample.after?.resources?.colliders?.[key];
  if(!Number.isFinite(actual)||actual<0||actual>limit)failures.push(`${sample.id}.colliders.${key}: unavailable or over budget`);
 }
 const {elapsedMs,totalMs}=sample.animation||{};
 if(!Number.isFinite(totalMs)||totalMs<0||!Number.isFinite(elapsedMs)||elapsedMs<1900||totalMs/elapsedMs>budget.maximumAnimationTimeRatio)failures.push(`${sample.id}.animation: unavailable or over instrumented budget`);
 return failures;
}
