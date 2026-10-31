// Pure input restriction shared by discipline policies. The existing vehicle
// step still computes braking and position; this never assigns a speed or pose.
export function restrictedRaceSpeedActions(actions,speedMetersPerSecond,restricted,limitMetersPerSecond){
 if(!restricted||Math.abs(speedMetersPerSecond)<=limitMetersPerSecond)return actions;
 return {...actions,throttle:0,reverse:0,serviceBrake:Math.max(actions.serviceBrake||0,Math.min(1,(Math.abs(speedMetersPerSecond)-limitMetersPerSecond)*.35))};
}
