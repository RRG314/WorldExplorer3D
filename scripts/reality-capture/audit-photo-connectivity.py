"""Local CPU diagnostic, not a replacement for AliceVision camera registration.

Reads only the supplied directory. No network, uploads, or reconstruction jobs.
Reports overlap evidence and threshold sensitivity, never building completeness.
"""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('directory')
args = parser.parse_args()
files = sorted(Path(args.directory).glob('*.jpg'))
if not 2 <= len(files) <= 48:
    raise SystemExit('Expected 2–48 local JPEG inputs')
cv2.setNumThreads(2)
cv2.setRNGSeed(7)
sift = cv2.SIFT_create(nfeatures=3000)
features = []
for file in files:
    gray = cv2.imread(str(file), cv2.IMREAD_GRAYSCALE)
    if gray is None:
        raise SystemExit('Undecodable image')
    scale = min(1, 1600 / max(gray.shape))
    gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    kp, desc = sift.detectAndCompute(gray, None)
    features.append((kp, desc, gray.shape))
matcher = cv2.BFMatcher(cv2.NORM_L2)
edges = []
for i in range(len(files)):
    ka, da, sa = features[i]
    for j in range(i + 1, len(files)):
        kb, db, sb = features[j]
        if da is None or db is None or min(len(da), len(db)) < 8:
            continue
        forward = {m.queryIdx: m.trainIdx for pair in matcher.knnMatch(da, db, k=2)
                   if len(pair) == 2 for m, n in [pair] if m.distance < 0.75*n.distance}
        reverse = {m.queryIdx: m.trainIdx for pair in matcher.knnMatch(db, da, k=2)
                   if len(pair) == 2 for m, n in [pair] if m.distance < 0.75*n.distance}
        pairs = [(a, b) for a, b in forward.items() if reverse.get(b) == a]
        if len(pairs) < 8:
            continue
        pa = np.float32([ka[a].pt for a, b in pairs])
        pb = np.float32([kb[b].pt for a, b in pairs])
        matrix, mask = cv2.findFundamentalMat(pa, pb, cv2.FM_RANSAC, 2.0, 0.999, 5000)
        if matrix is None or mask is None:
            continue
        use = mask.ravel().astype(bool)
        count = int(use.sum())
        span = min(float(np.prod(np.ptp(points[use], axis=0)) / (shape[0]*shape[1]))
                   for points, shape in [(pa, sa), (pb, sb)]) if count else 0
        edges.append({'a': i+1, 'b': j+1, 'mutualMatches': len(pairs), 'inliers': count,
                      'inlierRatio': round(count/len(pairs), 3), 'imageAreaSpan': round(span, 3)})
def components(threshold):
    unseen = set(range(1, len(files)+1))
    groups = []
    while unseen:
        group = {unseen.pop()}
        pending = list(group)
        while pending:
            current = pending.pop()
            for edge in edges:
                if edge['inliers'] < threshold or edge['inlierRatio'] < .4 or edge['imageAreaSpan'] < .05:
                    continue
                other = edge['b'] if edge['a'] == current else edge['a'] if edge['b'] == current else None
                if other in unseen:
                    unseen.remove(other)
                    group.add(other)
                    pending.append(other)
        groups.append(sorted(group))
    return sorted(groups, key=lambda group: (-len(group), group))
print(json.dumps({'algorithm': 'OpenCV SIFT / mutual ratio matches / fundamental RANSAC',
                  'opencv': cv2.__version__, 'photoCount': len(files),
                  'featureCounts': [len(kp) for kp, _, _ in features],
                  'componentsByMinimumInliers': {str(n): components(n) for n in [15, 25, 40]},
                  'strongestPairs': sorted(edges, key=lambda e: -e['inliers'])[:30],
                  'limitation': 'Threshold-sensitive overlap evidence, not solved cameras, original-run diagnosis, or surface completeness.'}, indent=2))
