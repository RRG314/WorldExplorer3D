"""Bounded conversion of a large private Chrome heap; never print heap values."""
import json
import mmap
import os
import re
import sys
import numpy as np

source = sys.argv[1]
with open(source, 'rb') as file:
    data = mmap.mmap(file.fileno(), 0, access=mmap.ACCESS_READ)
    start = data.find(b'"nodes":[')
    header = json.loads(data[:start] + b'"nodes":[]}')['snapshot']
    for field in ('nodes', 'edges'):
        marker = ('"' + field + '":[').encode()
        start = data.find(marker) + len(marker)
        end = data.find(b']', start)
        descriptor = os.open(source + '.' + field + '.bin', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        count = 0
        with os.fdopen(descriptor, 'wb') as out:
            tail = b''
            while start < end:
                stop = min(start + 4 * 1024 * 1024, end)
                chunk = tail + data[start:stop]
                cut = chunk.rfind(b',') if stop < end else len(chunk)
                values = np.fromstring(chunk[:cut].decode('ascii'), sep=',', dtype=np.uint64)
                assert not len(values) or values.max() <= 0xffffffff
                values.astype('<u4').tofile(out)
                count += len(values)
                tail = chunk[cut + 1:] if stop < end else b''
                start = stop
        singular = field[:-1]
        assert count == header[singular + '_count'] * len(header['meta'][singular + '_fields'])

    # Keep short identifier strings only, still in the private directory.
    # Scan closing quotes without materializing giant source/asset strings.
    position = data.find(b'"strings":[') + len(b'"strings":[')
    index = 0
    names = {}
    while True:
        while data[position] in b' \r\n\t,':
            position += 1
        if data[position] == ord(']'):
            break
        assert data[position] == ord('"')
        end = position + 1
        while True:
            end = data.find(b'"', end)
            assert end >= 0
            back = end - 1
            while data[back] == ord('\\'):
                back -= 1
            if (end - back - 1) % 2 == 0:
                break
            end += 1
        if end - position < 300:
            name = json.loads(data[position:end + 1])
            if re.fullmatch(r'[A-Za-z_$][A-Za-z0-9_$]{0,70}', name):
                names[index] = name
        index += 1
        position = end + 1
    descriptor = os.open(source + '.meta.json', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w') as out:
        json.dump({'snapshot': header, 'names': names}, out)
    print(json.dumps({'nodes': header['node_count'], 'edges': header['edge_count'], 'identifierCount': len(names)}))
