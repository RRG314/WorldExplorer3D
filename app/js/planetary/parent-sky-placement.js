// Mean, tidally locked orbit model. Local +x is east and +z is north.
// This is not a time-dependent ephemeris or a libration solution.
export function parentSkyPlacement({latitudeDeg=0,longitudeDeg=0,bodyRadiusM,parentRadiusM,parentMassKg,bodyMassKg=0,orbitalPeriodS,renderDistance=9000}) {
  const period=Math.abs(orbitalPeriodS);
  if(!(period>0&&parentMassKg>0&&parentRadiusM>0&&bodyRadiusM>0))return null;
  const distanceM=Math.cbrt(6.67430e-11*(parentMassKg+bodyMassKg)*(period/(2*Math.PI))**2);
  const lat=latitudeDeg*Math.PI/180,lon=longitudeDeg*Math.PI/180;
  const x=-Math.sin(lon)*distanceM;
  const y=Math.cos(lat)*Math.cos(lon)*distanceM-bodyRadiusM;
  const z=-Math.sin(lat)*Math.cos(lon)*distanceM;
  const range=Math.hypot(x,y,z);
  const angularRadius=Math.asin(Math.min(1,parentRadiusM/range));
  return {direction:{x:x/range,y:y/range,z:z/range},distanceM:range,
    angularDiameterDeg:angularRadius*360/Math.PI,
    renderDistance,renderRadius:renderDistance*Math.sin(angularRadius)};
}
