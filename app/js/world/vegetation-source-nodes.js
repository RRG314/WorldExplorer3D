// Road/building compilation consumes the full normalized node table locally.
// The later vegetation refresh only needs nodes referenced by selected rows.
// Keep those exact records without retaining every map node for the session.
export function retainTreeRowNodes(nodes,rows=[]) {
  const retained=Object.create(null);
  for(const row of rows || []) {
    for(const id of row?.nodes || [])if(nodes?.[id])retained[id]=nodes[id];
  }
  return retained;
}
