// Isolated loopback-only HTTP regression: malformed compression must never
// terminate a process that has already accepted a JSON frame. No cloud calls.
const http = require('node:http');
const zlib = require('node:zlib');
const parser = require('../../functions/node_modules/body-parser');
const version = require('../../functions/node_modules/body-parser/package.json').version;
const mode = process.argv[2] || 'normal';
const json = Buffer.from('{"probe":true}');
const first = Buffer.concat([zlib.gzipSync(json), ...(mode === 'tail' ? [Buffer.from([0])] : [])]);
const tail = mode === 'tail' ? Buffer.alloc(100 * 1024, 88) : Buffer.alloc(0);
const parse = parser.json();
let client;
const agent = new http.Agent({ keepAlive: true });
const server = http.createServer((req, res) => {
  if (req.method === 'GET') { res.end('healthy'); return; }
  parse(req, res, error => {
    res.statusCode = error?.status || 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(JSON.stringify(error ? { rejected: true } : { parsed: req.body?.probe === true }));
    // Hold the invalid suffix until parsing has completed. This models a
    // decoder error arriving after the valid compressed frame was consumed.
    if (tail.length) setImmediate(() => client.end(tail));
  });
});
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  client = http.request({ host: '127.0.0.1', port, method: 'POST', agent,
    headers: { 'Content-Type': mode === 'charset' ? 'application/json; charset=unsupported' : 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': first.length + tail.length }
  }, res => {
    let body = ''; res.on('data', value => { body += value; });
    res.on('end', () => setTimeout(() => {
      http.get({ host: '127.0.0.1', port, agent: false }, health => {
        let healthBody = ''; health.on('data', value => { healthBody += value; });
        health.on('end', () => { agent.destroy(); server.close(); console.log(JSON.stringify({ mode, version, status: res.statusCode, body, healthStatus: health.statusCode, healthBody })); });
      }).on('error', fail);
    }, 250));
  });
  client.on('error', fail);
  if (tail.length) client.write(first); else client.end(first);
});
function fail(error) { console.error(error.code || error.message); agent.destroy(); server.closeAllConnections(); server.close(); process.exitCode = 1; }
