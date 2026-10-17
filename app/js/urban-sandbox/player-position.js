// Civic ground actions follow the occupied vehicle or the selected ground
// mode. The walker remains allocated while driving; existence is not activity.
// Camera/drone focus does not move the player's ground body.
export function urbanGroundPlayerPosition(walking, car, occupiedVehiclePosition = null) {
  if (occupiedVehiclePosition) return occupiedVehiclePosition;
  return (walking?.mode === 'walk' ? walking.walker || car : car) || null;
}
