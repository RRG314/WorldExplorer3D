function boundedScore(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function groundVehicleTuning(capability) {
  const control = boundedScore(capability?.assistance?.control);
  const interpretation = boundedScore(capability?.assistance?.interpretation);
  return Object.freeze({
    type: 'GroundVehicleCharacterTuning',
    accelerationScale: Number((1 + control * 0.0012).toFixed(4)),
    steeringAngleScale: Number((1 + control * 0.0008).toFixed(4)),
    steeringResponseScale: Number((1 + control * 0.0014).toFixed(4)),
    brakingScale: Number((1 + interpretation * 0.0008).toFixed(4)),
    recoveryScale: Number((1 + control * 0.0012).toFixed(4)),
    informationTier: String(capability?.assistance?.informationTier || 'basic')
  });
}

export { groundVehicleTuning };
