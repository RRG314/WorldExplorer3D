// Invisible/promoted hosts remain owned by their agents but leave the render
// tree. Three otherwise updates every bone even below an invisible group.
export function setPopulationHostVisible(host, group, visible) {
  host.visible = visible;
  if (visible) {
    if (host.parent !== group) group.add(host);
  } else if (host.parent === group) group.remove(host);
}
