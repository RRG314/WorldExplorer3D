import {servePlaceLookupPreview} from './place-lookup-preview.mjs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import geospatial from '../functions/geospatial.js';
import { serveMutableSourceManifest } from './source-preview-manifest.mjs';
import { assertPreviewRequest, resolvePreviewFile } from './lib/local-preview-security.mjs';

const sourceRootDir = process.cwd();
const rootDir = path.resolve(process.env.WE3D_PREVIEW_ROOT || sourceRootDir);
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4192);
const { queryAircraft, queryDeFlockCameras, queryStreetImagery } = geospatial;

async function readCandidateManifest() {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(rootDir, 'build-manifest.json'), 'utf8'));
    const candidateId = String(manifest?.candidateId || '');
    if (!candidateId || candidateId !== String(manifest?.buildId || '')) {
      throw new Error('Candidate manifest has no matching candidate/build identity.');
    }
    return Object.freeze({ ...manifest, candidateId });
  } catch (error) {
    if (process.env.WE3D_PREVIEW_ROOT) throw error;
    return null;
  }
}

const candidateManifest = await readCandidateManifest();
const candidateId = candidateManifest?.candidateId || '';

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.map', 'application/json; charset=utf-8'],
  ['.glb', 'model/gltf-binary'],
  ['.wasm', 'application/wasm']
]);

const server = http.createServer(async (req, res) => {
  try {
    const actualPort = server.address().port;
    assertPreviewRequest(req, actualPort, host);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reqUrl = new URL(req.url || '/', `http://${host}:${actualPort}`);
    if(await servePlaceLookupPreview(req,res,reqUrl))return;
    if(reqUrl.pathname==='/__preview/load-trace' && req.method==='POST' && !candidateId) {
      if(req.headers.origin!==`http://${host}:${actualPort}` && req.headers.origin!==`http://localhost:${actualPort}`) {res.writeHead(403);res.end();return;}
      let body='';
      for await(const chunk of req) {body+=chunk;if(body.length>2048){res.writeHead(413);res.end();return;}}
      try {
        const value=JSON.parse(body);
        const scope=String(value.scope || '').replace(/[^a-z-]/g,'').slice(0,24);
        const phase=String(value.phase || '').replace(/[^a-zA-Z0-9:_-]/g,'').slice(0,100);
        const counters=Object.fromEntries(Object.entries(value.counters || {}).filter(([key,n])=>/^[a-zA-Z]+$/.test(key) && typeof n==='number' && Number.isFinite(n)).slice(0,12));
        console.log('[PreviewLoadTrace]',scope,phase,JSON.stringify(counters));
      } catch {res.writeHead(400);res.end();return;}
      res.writeHead(204,{'Cache-Control':'no-store'});res.end();return;
    }
    if (!candidateId && await serveMutableSourceManifest({
      pathname: reqUrl.pathname,
      rootDir,
      response: res
    })) return;
    const requestedCandidate = String(reqUrl.searchParams.get('candidate') || '');
    if (requestedCandidate && (!candidateId || requestedCandidate !== candidateId)) {
      res.writeHead(409, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(candidateId
        ? `candidate identity mismatch: expected ${candidateId}`
        : 'source preview is mutable and cannot be addressed as a release candidate');
      return;
    }
    if (reqUrl.pathname === '/api/geospatial/street-imagery') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed.' }));
        return;
      }
      try {
        const payload = await queryStreetImagery(Object.fromEntries(reqUrl.searchParams));
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=900'
        });
        res.end(JSON.stringify(payload));
      } catch (error) {
        const status = Number(error?.statusCode) || (error?.name === 'AbortError' ? 504 : 502);
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: status === 504 ? 'Street imagery provider timed out.' : (error?.message || 'Street imagery unavailable.') }));
      }
      return;
    }
    if (reqUrl.pathname === '/api/geospatial/aircraft') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed.' }));
        return;
      }
      try {
        const payload = await queryAircraft(Object.fromEntries(reqUrl.searchParams));
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=120'
        });
        res.end(JSON.stringify(payload));
      } catch (error) {
        const status = Number(error?.statusCode) || (error?.name === 'AbortError' ? 504 : 502);
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: status === 504 ? 'OpenSky timed out.' : (error?.message || 'Aircraft observations unavailable.') }));
      }
      return;
    }
    if (reqUrl.pathname === '/api/geospatial/deflock-cameras') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed.' }));
        return;
      }
      try {
        const payload = await queryDeFlockCameras(Object.fromEntries(reqUrl.searchParams));
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=21600'
        });
        res.end(JSON.stringify(payload));
      } catch (error) {
        const status = Number(error?.statusCode) || (error?.name === 'AbortError' ? 504 : 502);
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: error?.message || 'Mapped camera data is unavailable.' }));
      }
      return;
    }
    const filePath = await resolvePreviewFile(rootDir, reqUrl.pathname || '/');
    if (!filePath) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0'
      });
      res.end('not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mime.get(ext) || 'application/octet-stream';
    const body = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': candidateId && !/\.html?$/i.test(ext)
        ? 'public, max-age=31536000, immutable'
        : 'no-store, no-cache, must-revalidate, max-age=0',
      ...(candidateId ? { 'X-WorldExplorer-Candidate': candidateId } : {}),
      Pragma: 'no-cache',
      Expires: '0'
    });
    res.end(body);
  } catch (error) {
    res.writeHead([400,403].includes(error.statusCode) ? error.statusCode : 500, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
    res.end(error.statusCode === 403 ? 'forbidden' : error.statusCode === 400 ? 'invalid request' : 'preview request failed');
  }
});

server.listen(port, host, () => {
  if (candidateId) {
    console.log(`Immutable candidate ${candidateId}`);
    console.log(`http://${host}:${server.address().port}/app/?candidate=${encodeURIComponent(candidateId)}`);
  } else {
    console.log(`Mutable source preview running at http://${host}:${server.address().port}/`);
  }
});
