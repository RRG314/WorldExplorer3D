import {carSpeedToMph}from'./vehicle-speed-units.js?v=2';
// Original game calibration, not manufacturer specifications or a copy of a
// commercial simulator. Speed -> wheel RPM -> ratios -> engine map -> thrust.
const RATIOS=Object.freeze([4.0,2.5,1.72,1.24,.94]);
const CURVE=Object.freeze([[.12,.55],[.27,.8],[.5,1],[.76,.94],[1,.58],[1.06,0]]);
function torqueAt(rpm,redline){const n=rpm/redline;for(let i=1;i<CURVE.length;i++)if(n<=CURVE[i][0]){const a=CURVE[i-1],b=CURVE[i],t=Math.max(0,(n-a[0])/(b[0]-a[0]));return a[1]+(b[1]-a[1])*t;}return 0;}
export function stepAutomaticPowertrain(car,frame,dt,handling){
 const heavy=handling.massKg>4500,redline=heavy?4600:6200,idle=heavy?750:850,wheelRadius=Math.max(.25,Number(handling.wheelRadius)||Number(handling.height)*.22||.35);
 const speedMps=Math.abs(carSpeedToMph(car.speed))*.44704,wheelRpm=speedMps/wheelRadius*60/(Math.PI*2),finalDrive=heavy?4.2:3.4;
 const reverse=car.speed<-.5||Math.abs(car.speed)<=.5&&frame.reverse;
 let gear=Number.isInteger(car.driveGear)&&car.driveGear>0?Math.min(RATIOS.length,car.driveGear):1;
 car.shiftTime=Math.max(0,(car.shiftTime||0)-dt);
 if(!reverse&&car.shiftTime===0){
  const connectedRpm=wheelRpm*RATIOS[gear-1]*finalDrive;
  if(gear<RATIOS.length&&connectedRpm>redline*.83){gear++;car.shiftTime=.16;}
  else if(gear>1&&connectedRpm<redline*.27&&wheelRpm*RATIOS[gear-2]*finalDrive<redline*.76){gear--;car.shiftTime=.12;}
 }
 car.driveGear=reverse?-1:gear;car.engineRedlineRpm=redline;
 const ratio=reverse?3.55:RATIOS[gear-1],connected=wheelRpm*ratio*finalDrive;
 const throttle=frame.gas?frame.driveCommand.forward:frame.reverse?frame.driveCommand.reverse:0;
 const target=Math.min(redline*1.04,Math.max(idle,connected,throttle>0&&speedMps<3?idle+throttle*900:idle));
 car.engineRpm=Number.isFinite(car.engineRpm)?car.engineRpm+(target-car.engineRpm)*(1-Math.exp(-dt*14)):target;
 car.engineLoad=throttle;
 const massResponse=Math.max(.35,Math.min(1.25,Math.pow(1540/Math.max(600,handling.massKg||1540),.45)));
 return torqueAt(car.engineRpm,redline)*(ratio/RATIOS[0])*massResponse*(car.shiftTime>0?.18:1);
}
