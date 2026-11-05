"""Bounded, read-only service evidence. No player coordinates or credentials."""
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

base = 'https://energy.usgs.gov/arcgis/rest/services/Hosted/mapunitpolys_esurf_labels/FeatureServer/0'
queries = {
    'current-runtime-layer': base + '?f=pjson',
    'baltimore-public-point': base + '/query?' + urllib.parse.urlencode({
        'f': 'json', 'geometry': '-76.6122,39.2904', 'geometryType': 'esriGeometryPoint',
        'inSR': '4326', 'spatialRel': 'esriSpatialRelIntersects',
        'outFields': 'f_mapunitpolys_id,name,geomaterial,geomaterialconfidence,age,map_citation,ngmdb_url',
        'returnGeometry': 'false', 'resultRecordCount': '16'}),
    'mrds-access': 'https://mrdata.usgs.gov/mrds/',
    'usmin-access': 'https://mrdata.usgs.gov/usmin/',
}
rows = []
for name, url in queries.items():
    row = {'name': name, 'url': url, 'checkedAt': datetime.now(timezone.utc).isoformat()}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'WorldExplorer3D-research/1.0'}), timeout=20) as r:
            body = r.read(1024 * 1024 + 1)
            row.update(status=r.status, bytes=len(body), bounded=len(body) <= 1024 * 1024)
            if not row['bounded']:
                raise ValueError('Response exceeded 1 MiB; not parsed')
            # ArcGIS can label its JSON as text/plain. Parse only JSON-shaped
            # bounded bodies; never mistake a provider HTML error for data.
            if 'json' in r.headers.get('Content-Type', '') or body.lstrip().startswith(b'{'):
                data = json.loads(body)
                row['data'] = {k: data[k] for k in ['name', 'description', 'copyrightText', 'currentVersion', 'minScale', 'maxScale', 'extent', 'editingInfo', 'fields', 'error', 'features', 'exceededTransferLimit'] if k in data}
    except Exception as e:
        row['error'] = str(e)
    rows.append(row)
out = Path('output/research/career-world-20261105/geology-service-probe.json')
out.write_text(json.dumps(rows, indent=2) + '\n')
print(json.dumps([{k: r[k] for k in ['name', 'status', 'bytes', 'error'] if k in r} for r in rows]))
