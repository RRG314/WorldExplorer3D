import {VEHICLE_ROOT_TO_GROUND_METERS} from '../engine/vehicle-catalog.js?v=6';

// Population traffic poses sit on the road. Promoted and responder vehicle
// roots include their visual pivot offset; people are positioned at their feet.
// Keep that distinction here so an overhead actor cannot become an infinite
// collision column through a bridge, tunnel, or jumping player's position.
export function urbanTargetVerticalSpan(target) {
  const y=target?.y;
  if(!Number.isFinite(y))return null;
  const vehicle=String(target.kind).includes('vehicle');
  const variant=target.variant || target.ref?.variant || target.ref?.definition;
  const base=vehicle&&target.kind!=='ambient_vehicle'?y-VEHICLE_ROOT_TO_GROUND_METERS:y;
  const height=vehicle?Math.max(.5,Number(variant?.height)||1.8):1.8*Math.max(.5,Number(target.heightScale||target.ref?.heightScale)||1);
  return {base,top:base+height};
}
export function urbanTargetOverlapsHeight(target,actorBaseY,actorHeight=1.8,tolerance=.15) {
  const span=urbanTargetVerticalSpan(target);
  // Retain the established horizontal behavior for legacy unresolved poses.
  // All published population and promoted actors supply a finite elevation.
  if(!span||!Number.isFinite(actorBaseY))return true;
  return actorBaseY+Math.max(.5,actorHeight)>=span.base-tolerance && actorBaseY<=span.top+tolerance;
}
