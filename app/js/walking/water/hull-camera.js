import {resolveThirdPersonCameraCollision} from '../camera-collision.js?v=1';

export function resolveSwimHullCamera({anchor,target,vesselPosition,checkBuildingCollision}) {
  const clipped=resolveThirdPersonCameraCollision({anchor,target,checkBuildingCollision});
  if(Math.hypot(clipped.x-anchor.x,clipped.y-anchor.y,clipped.z-anchor.z)>=1.8)return clipped;
  // A hull behind the explorer must not squeeze the camera into their tank.
  // The radial direction points out of the parked hull's convex bounds.
  const dx=anchor.x-vesselPosition.x,dz=anchor.z-vesselPosition.z,length=Math.hypot(dx,dz)||1;
  return resolveThirdPersonCameraCollision({anchor,target:{x:anchor.x+dx/length*4,y:anchor.y+.6,z:anchor.z+dz/length*4},checkBuildingCollision});
}

