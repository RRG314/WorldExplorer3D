// One bounded movement trigger; no independent timer or parallel request loop.
export function createNearbyCaptureRefresh(refresh) {
  let previous=null,lastCheck=-Infinity,pending=false;
  return async function update(position,now,sequence) {
    if(pending||!Number.isFinite(position?.x)||!Number.isFinite(position?.z))return false;
    if(previous?.sequence===sequence &&
       (now-lastCheck<10000||Math.hypot(position.x-previous.x,position.z-previous.z)<80))return false;
    previous={x:position.x,z:position.z,sequence};lastCheck=now;pending=true;
    try {await refresh();return true;} finally {pending=false;}
  };
}
