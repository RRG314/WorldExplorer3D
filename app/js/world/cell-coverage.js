// Exact integer-grid coverage. A road corridor usually fills contiguous runs;
// retain those runs instead of allocating a string for every occupied cell.
export function createCellCoverage() {
  const rows = new Map();
  let coveredCells = 0;
  let intervalCount = 0;

  function addSquare(x, z, radius) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z) || !Number.isSafeInteger(radius) || radius < 0 ||
        ![x - radius, x + radius, z - radius, z + radius].every(Number.isSafeInteger)) {
      throw new RangeError('Cell coverage requires integer coordinates and a nonnegative integer radius');
    }
    for (let row = x - radius; row <= x + radius; row++) {
      let lo = z - radius, hi = z + radius;
      const intervals = rows.get(row);
      if (!intervals) {
        rows.set(row, [[lo, hi]]);
        coveredCells += hi - lo + 1;
        intervalCount++;
        continue;
      }
      let left = 0, right = intervals.length;
      while (left < right) {
        const mid = (left + right) >>> 1;
        if (intervals[mid][1] < lo - 1) left = mid + 1;
        else right = mid;
      }
      const first = left;
      if (intervals[first]?.[0] <= lo && intervals[first][1] >= hi) continue;
      while (left < intervals.length && intervals[left][0] <= hi + 1) {
        lo = Math.min(lo, intervals[left][0]);
        hi = Math.max(hi, intervals[left][1]);
        coveredCells -= intervals[left][1] - intervals[left][0] + 1;
        left++;
      }
      intervals.splice(first, left - first, [lo, hi]);
      coveredCells += hi - lo + 1;
      intervalCount += 1 - (left - first);
    }
  }

  function has(x, z) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) return false;
    const intervals = rows.get(x);
    if (!intervals) return false;
    let left = 0, right = intervals.length;
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (intervals[mid][1] < z) left = mid + 1;
      else right = mid;
    }
    return left < intervals.length && intervals[left][0] <= z;
  }

  return { addSquare, has, stats: () => ({ rows: rows.size, intervals: intervalCount, coveredCells }) };
}
