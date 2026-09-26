const OVERPASS_HOSTS = new Set(['lz4.overpass-api.de','overpass-api.de','overpass.private.coffee']);
// Mirror choice and server execution timeout do not change an Overpass query's
// requested map features. Replay one successful response for that same query.
// Every other request, including ranges and POST bodies, stays byte-specific.
export function publicProviderFixtureRequest({method,url,range='',body=''}) {
 const parsed=new URL(url);
 if(OVERPASS_HOSTS.has(parsed.hostname)&&parsed.pathname==='/api/interpreter'){
  const query=method==='GET'?parsed.searchParams.get('data'):body.startsWith('data=')?new URLSearchParams(body).get('data'):body;
  if(query)return {semanticOverpass:true,key:['overpass-query',query.replace(/\[timeout:\s*\d+\s*\]/g,'[timeout:fixture]')]};
 }
 return {semanticOverpass:false,key:[method,url,range,body]};
}
