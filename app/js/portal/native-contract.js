// Public application identities, not credentials. Native proof must come from
// Firebase App Check; an app ID supplied in a URL/body is never authentication.
export const PORTAL_NATIVE_CLIENTS=Object.freeze({
  'worldexplorer3d-d9b83':Object.freeze({
    '1:469573887496:android:074e2769d10bcbdd42d3bd':Object.freeze({platform:'android',label:'World Explorer 3D for Android',callback:'io.worldexplorer3d.app://portal-connect'}),
    '1:469573887496:ios:e86ce3a7af39b6d842d3bd':Object.freeze({platform:'ios',label:'World Explorer 3D for Apple',callback:'io.worldexplorer3d.app://portal-connect'})
  }),
  'we3d-staging-20260712':Object.freeze({
    '1:524178734996:android:eededce4f644ea41f51981':Object.freeze({platform:'android',label:'World Explorer 3D for Android · development',callback:'io.worldexplorer3d.app.staging://portal-connect'}),
    '1:524178734996:ios:2d8e12cf5c57d2cef51981':Object.freeze({platform:'ios',label:'World Explorer 3D for Apple · development',callback:'io.worldexplorer3d.app.staging://portal-connect'}),
    '1:524178734996:android:b6c8ac1247bbf6f3f51981':Object.freeze({platform:'android',label:'World Explorer 3D for Android · test build',callback:'io.worldexplorer3d.app.staging://portal-connect'}),
    '1:524178734996:ios:84e80cd71e77579cf51981':Object.freeze({platform:'ios',label:'World Explorer 3D for Apple · test build',callback:'io.worldexplorer3d.app.staging://portal-connect'})
  })
});
export const portalPairingId=value=>typeof value==='string'&&value.length===43&&/^[A-Za-z0-9_-]{43}$/.test(value);
export function portalCallbackAllowed(value,projectId){return Object.values(PORTAL_NATIVE_CLIENTS[projectId]||{}).some(client=>client.callback===value);}
