// Local previews use the same backend authority; never bypass the app-wide
// provider lease by performing public geocoding in each dev server.
export async function servePlaceLookupPreview(req,res,url){
 if(!['/api/geospatial/search','/api/geospatial/reverse'].includes(url.pathname))return false;
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 const configured=process.env.WE3D_PLACE_LOOKUP_EMULATOR_ORIGIN;
 if(!configured){res.writeHead(503).end(JSON.stringify({error:'Place lookup needs the local Functions emulator. Coordinates and saved places remain available.'}));return true;}
 const origin=new URL(configured);if(!['127.0.0.1','localhost'].includes(origin.hostname)||origin.protocol!=='http:')throw Error('Place lookup preview requires a loopback emulator.');
 if(req.method!=='GET'){res.writeHead(405).end('{}');return true;}
 const target=new URL('/we3d-staging-20260712/us-central1/getPlaceLookup',origin);target.search=url.search;
 try{const result=await fetch(target,{headers:req.headers['x-firebase-appcheck']?{'X-Firebase-AppCheck':req.headers['x-firebase-appcheck']}:{},signal:AbortSignal.timeout(12000)});res.writeHead(result.status).end(await result.text());}
 catch{res.writeHead(502).end(JSON.stringify({error:'Local place lookup unavailable.'}));}return true;
}
