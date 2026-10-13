// Enclosed, authored spaces publish their complete walls and support surfaces.
// The overlapping geographic world remains loaded, but must not contribute
// buildings, tree trunks, outdoor props or creative blocks to indoor movement.
// Legacy partial/mapped interiors keep their existing world collision behavior.
export function usesContainedInteriorPhysics(active){
  return !!active&&(active.environmentKind==='expedition-ship'||active.floorPlan?.authored===true);
}
