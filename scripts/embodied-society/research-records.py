#!/usr/bin/env python3
"""Allowlisted public development inventory. Never copies raw prompts or errors."""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'research/embodied-society/records'
KINDS = {'move', 'wait', 'gather', 'consume', 'craft', 'finish', 'cancel', 'build', 'store', 'retrieve', 'rest'}
STATUSES = {'reserved', 'completed', 'failed'}

def integer(value):
    return type(value) is int and value >= 0

def number_or_none(value):
    return value if integer(value) else None

def read_snapshot(path):
    if path.is_symlink() or path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('Snapshot is linked or exceeds the 2 MiB bound')
    data = path.read_bytes()
    return json.loads(data), hashlib.sha256(data).hexdigest()

def make_run(directory):
    if directory.is_symlink() or not re.fullmatch(r'free-\d+-[a-f0-9]+', directory.name):
        raise ValueError('Invalid run directory')
    ledger, digest = read_snapshot(directory / 'model/workshop.json')
    events = []
    for event in ledger['events']:
        usage = event.get('usage') or {}
        kind = (event.get('command') or {}).get('kind')
        events.append({'call': event['call'], 'status': event['status'],
                       'commandKind': kind if kind in KINDS else None,
                       'usage': {k: number_or_none(usage.get(k)) for k in ('inputTokens', 'outputTokens')}})
    checkpoint = {'status': None, 'frames': None, 'controllerCalls': None}
    sources = {'modelSha256': digest, 'checkpointSha256': None}
    cp = directory / 'checkpoint/workshop.json'
    if cp.exists():
        data, sources['checkpointSha256'] = read_snapshot(cp)
        checkpoint = {'status': data.get('status') if data.get('status') in {'ended', 'paused', 'running', 'failed', 'aborted'} else None,
                      'frames': number_or_none(data.get('frames')), 'controllerCalls': number_or_none(data.get('calls'))}
    return {'runId': directory.name, 'sources': sources, 'providerCalls': ledger['calls'],
            'providerEvents': events, 'checkpoint': checkpoint}

def exact(obj, keys):
    if not isinstance(obj, dict) or set(obj) != set(keys):
        raise ValueError('Unexpected or missing fields in public record')

def validate(doc):
    exact(doc, ['schemaVersion', 'recordClass', 'scope', 'runs'])
    if doc['schemaVersion'] != 1 or doc['recordClass'] != 'retrospective-development-inventory' or doc['scope'] != 'retained-local-free-runs':
        raise ValueError('Invalid inventory identity')
    if not isinstance(doc['runs'], list) or not doc['runs']:
        raise ValueError('Inventory must have runs')
    ids = set()
    for run in doc['runs']:
        exact(run, ['runId', 'sources', 'providerCalls', 'providerEvents', 'checkpoint'])
        if not isinstance(run['runId'], str) or not re.fullmatch(r'free-\d+-[a-f0-9]+', run['runId']) or run['runId'] in ids:
            raise ValueError('Invalid or duplicate run ID')
        ids.add(run['runId'])
        exact(run['sources'], ['modelSha256', 'checkpointSha256'])
        for k,v in run['sources'].items():
            if (v is None and k == 'checkpointSha256'): continue
            if not isinstance(v, str) or not re.fullmatch('[a-f0-9]{64}',v): raise ValueError('Invalid source hash')
        events = run['providerEvents']
        if not isinstance(events,list) or not integer(run['providerCalls']) or run['providerCalls'] != len(events):
            raise ValueError('Ledger call/event mismatch')
        for i,e in enumerate(events,1):
            exact(e,['call','status','commandKind','usage'])
            if type(e['call']) is not int or e['call'] != i or e['status'] not in STATUSES or (e['commandKind'] is not None and e['commandKind'] not in KINDS):
                raise ValueError('Invalid event')
            exact(e['usage'],['inputTokens','outputTokens'])
            if any(v is not None and not integer(v) for v in e['usage'].values()): raise ValueError('Invalid token usage')
        cp=run['checkpoint'];exact(cp,['status','frames','controllerCalls'])
        if cp['status'] not in {None,'ended','paused','running','failed','aborted'}:raise ValueError('Invalid terminal status')
        if any(cp[k] is not None and not integer(cp[k]) for k in ['frames','controllerCalls']):raise ValueError('Invalid checkpoint count')
        # Controller attempts can fail before provider dispatch (for example cooldown rejection).
    return doc

def summarize(doc):
    validate(doc)
    events=[e for r in doc['runs'] for e in r['providerEvents']]
    return {'schemaVersion':1,'runs':len(doc['runs']),'providerCalls':len(events),
            'eventStatuses':{s:sum(e['status']==s for e in events) for s in sorted(STATUSES)},
            'knownTokenUsage':{k:sum(e['usage'][k] or 0 for e in events) for k in ['inputTokens','outputTokens']},
            'eventsWithMissingUsage':sum(any(v is None for v in e['usage'].values()) for e in events),
            'worldActionsApplied':None,
            'interpretation':'Provider completion does not prove world application; see separate behavioral evidence.'}

def write(path,data):
    path.write_text(json.dumps(data,indent=2,sort_keys=True)+'\n')

def main(args):
    if args == ['check']:
        doc=validate(json.loads((DEST/'development-runs.json').read_text()))
        if summarize(doc)!=json.loads((DEST/'summary.json').read_text()):raise ValueError('Derived summary drift')
        print('Validated public inventory and derived summary:',len(doc['runs']),'runs')
    elif len(args)==3 and args[0]=='export':
        source,dest=map(Path,args[1:]);runs=[]
        for directory in sorted(source.glob('free-*')):
            if (directory/'model/workshop.json').is_file():runs.append(make_run(directory))
        doc=validate({'schemaVersion':1,'recordClass':'retrospective-development-inventory','scope':'retained-local-free-runs','runs':runs})
        dest.mkdir(parents=True,exist_ok=True)
        write(dest/'development-runs.json',doc);write(dest/'summary.json',summarize(doc))
        print('Exported allowlisted records:',len(runs),'runs; raw files unchanged')
    else:raise ValueError('Usage: research-records.py check | export PRIVATE_RUN_ROOT PUBLIC_RECORD_DIR')

if __name__=='__main__':
    try:main(sys.argv[1:])
    except (ValueError,KeyError,TypeError,OSError) as exc:
        # Do not echo raw data, paths or exception payloads to public logs.
        print('Record operation failed:',type(exc).__name__,file=sys.stderr);sys.exit(1)
