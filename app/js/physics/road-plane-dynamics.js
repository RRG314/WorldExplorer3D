// Optional banked-pavement dynamics in the shared driving kernel. Angles use
// the existing YXZ chassis attitude: positive roll raises the right wheels;
// negative pitch climbs forward. Speeds/accelerations here are SI units.
export const BANKED_ROAD_MODEL='banked-road-v1';
export const BANKED_ROAD_MAXIMUM_CROSSFALL=.7;
export const BANKED_ROAD_MAXIMUM_GRADE=.22;
export const BANKED_ROAD_MAXIMUM_ROLL=Math.atan(BANKED_ROAD_MAXIMUM_CROSSFALL);
export const ROAD_GRAVITY_METERS_PER_SECOND_SQUARED=9.81;

export function roadPlaneForces({pitch,roll,forwardSpeedMetersPerSecond,yawRate,tyreGrip}){
 if(![pitch,roll,forwardSpeedMetersPerSecond,yawRate,tyreGrip].every(Number.isFinite)||Math.abs(pitch)>.55+1e-8||
  Math.abs(roll)>BANKED_ROAD_MAXIMUM_ROLL+1e-8||tyreGrip<0||tyreGrip>1.35)throw Error('invalid_road_plane_dynamics');
 const cp=Math.cos(pitch),cr=Math.cos(roll),sr=Math.sin(roll),g=ROAD_GRAVITY_METERS_PER_SECOND_SQUARED;
 const horizontalSpeed=forwardSpeedMetersPerSecond*cp,curveAccelerationRight=horizontalSpeed*yawRate;
 const gravityForward=g*Math.sin(pitch),gravityRight=-g*cp*sr;
 // N/m = vertical gravity projected into the deck + normal curvature load.
 // At the ideal banked speed this gives g/cos(bank), rather than g*cos(bank).
 const normalAcceleration=Math.max(0,g*cp*cr-curveAccelerationRight*sr),tractionAcceleration=tyreGrip*normalAcceleration;
 const lateralDemand=curveAccelerationRight*cr-gravityRight;
 const longitudinalTractionAcceleration=Math.sqrt(Math.max(0,tractionAcceleration**2-lateralDemand**2));
 const lateralResidualAcceleration=gravityRight+Math.max(-tractionAcceleration,Math.min(tractionAcceleration,lateralDemand))-curveAccelerationRight*cr;
 // Solve both signed friction-cone boundaries. A bank aids one direction and
 // opposes the other; an absolute flat-road yaw cap cannot represent that.
 const minimumCurveAcceleration=-g*cp*(tyreGrip*cr+sr)/(cr-tyreGrip*sr);
 const maximumCurveAcceleration=g*cp*(tyreGrip*cr-sr)/(cr+tyreGrip*sr);
 const denominator=(horizontalSpeed<0?-1:1)*Math.max(2,Math.abs(horizontalSpeed));
 const first=minimumCurveAcceleration/denominator,second=maximumCurveAcceleration/denominator;
 return Object.freeze({pitch,roll,gravityForward,gravityRight,normalAcceleration,tractionAcceleration,lateralDemand,
  longitudinalTractionAcceleration,lateralResidualAcceleration,
  lateralGripReserve:tractionAcceleration>0?longitudinalTractionAcceleration/tractionAcceleration:0,
  // Insufficient static grip causes a downhill slide, not an invented steering
  // input. Zero heading rate remains possible even outside the no-slip cone.
  minimumYawRate:Math.min(0,first,second),maximumYawRate:Math.max(0,first,second)});
}

export function roadPlaneHorizontalVelocity(forward,lateral,{pitch,roll}){
 if(![forward,lateral,pitch,roll].every(Number.isFinite))throw Error('invalid_road_plane_velocity');
 return {right:lateral*Math.cos(roll),forward:forward*Math.cos(pitch)+lateral*Math.sin(pitch)*Math.sin(roll)};
}
