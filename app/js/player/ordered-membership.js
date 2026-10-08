// Small indexed heaps preserve original Map insertion precedence when
// an existing item changes catalog/event membership. Deleted rows leave no
// tombstones, and every bucket owns only its current members.
export function createOrderedMembership() {
  const buckets = new Map();
  function swap(bucket, a, b) {
    [bucket.heap[a], bucket.heap[b]] = [bucket.heap[b], bucket.heap[a]];
    bucket.positions.set(bucket.heap[a].id, a);
    bucket.positions.set(bucket.heap[b].id, b);
  }
  function repair(bucket, index) {
    const heap = bucket.heap;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent].rank <= heap[index].rank) break;
      swap(bucket, parent, index); index = parent;
    }
    while (true) {
      const left = index * 2 + 1, right = left + 1;
      let first = index;
      if (left < heap.length && heap[left].rank < heap[first].rank) first = left;
      if (right < heap.length && heap[right].rank < heap[first].rank) first = right;
      if (first === index) break;
      swap(bucket, index, first); index = first;
    }
  }
  return Object.freeze({
    first(key) { return buckets.get(key)?.heap[0]?.id || null; },
    add(key, id, rank) {
      let bucket = buckets.get(key);
      if (!bucket) { bucket = { heap: [], positions: new Map() }; buckets.set(key, bucket); }
      if (bucket.positions.has(id)) return;
      const index = bucket.heap.length;
      bucket.heap.push({ id, rank }); bucket.positions.set(id, index);
      repair(bucket, index);
    },
    remove(key, id) {
      const bucket = buckets.get(key), index = bucket?.positions.get(id);
      if (index === undefined) return;
      const last = bucket.heap.pop(); bucket.positions.delete(id);
      if (index < bucket.heap.length) {
        bucket.heap[index] = last; bucket.positions.set(last.id, index); repair(bucket, index);
      }
      if (!bucket.heap.length) buckets.delete(key);
    }
  });
}
