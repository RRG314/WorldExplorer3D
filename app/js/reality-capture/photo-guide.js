// Capture instructions, not camera-pose estimation or reconstruction coverage.
export function photoGuideMarkup(kind, activeSector, scope = 'building') {
  const room = kind === 'interior_room';
  const count = room ? 6 : 8;
  const active = Number.isInteger(activeSector) && activeSector >= 0 && activeSector < count ? activeSector : 0;
  const points = Array.from({ length: count }, (_, index) => {
    const angle = Math.PI / 2 - index * Math.PI * 2 / count;
    return [150 + Math.cos(angle) * (room ? 55 : 110), 100 + Math.sin(angle) * (room ? 38 : 76)];
  });
  const [x, y] = points[active];
  const targetX = room ? 150 + (x - 150) * 1.8 : 150;
  const targetY = room ? 100 + (y - 100) * 1.8 : 100;
  return `<div class="capturePhotoTemplate">
    <strong>${room ? 'Move through the room' : 'Move along accessible sides'}</strong>
    <svg viewBox="0 0 300 200" role="img" aria-label="Example top-down ${room ? 'room' : 'building'} guide. Position ${active + 1} selected; arrow shows which way to face. Not a map or measured camera position.">
      <defs><marker id="captureAimArrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="#ffe09a"/></marker></defs>
      <rect x="${room ? 45 : 100}" y="${room ? 28 : 62}" width="${room ? 210 : 100}" height="${room ? 144 : 76}" rx="4" fill="#244552" stroke="#91bbc8" stroke-width="3"/>
      <text x="150" y="103" fill="#e9fbff" text-anchor="middle" font-size="12">${room ? 'ROOM' : 'BUILDING'}</text>
      <text x="150" y="${room ? 189 : 153}" fill="#b9d5da" text-anchor="middle" font-size="11">${room ? 'Start at the door' : 'Front / main entrance'}</text>
      <line x1="${x}" y1="${y}" x2="${targetX}" y2="${targetY}" stroke="#ffe09a" stroke-width="2" marker-end="url(#captureAimArrow)"/>
      ${points.map(([px, py], index) => `<circle cx="${px}" cy="${py}" r="12" fill="${index === active ? '#ffe09a' : '#102b36'}" stroke="#91bbc8"/><text x="${px}" y="${py + 4}" text-anchor="middle" fill="${index === active ? '#102b36' : '#e9fbff'}" font-size="12">${index + 1}</text>`).join('')}
    </svg>
    <p>Example positions only—not your actual ${room ? 'room layout' : 'building footprint'}. Select the matching view below. Move a short distance between shots; do not just turn in one spot.</p>
    <div class="captureOverlapExample" aria-label="Two example photo frames with about 70 percent overlap"><span>Previous photo</span><span>Next photo</span></div>
    <p><strong>Keep about 70% of the previous view.</strong> Keep the same lens and orientation; avoid digital zoom. Pause and hold still for each shot.</p>
    <p>${room ? 'Work on one room at a time. Include wall–floor edges, corners and the doorway in neighboring photos. Take additional upward and downward views while keeping shared detail. Keep lights and furniture unchanged.' : 'Include doors, windows, corners and the base of the wall. For a tall facade, take overlapping lower and upper rows from safe ground; retain shared windows or other details between rows. Do not climb or step into traffic to fit a roof.'}</p>
    <p class="captureGuideLimit">These templates cannot verify camera position or coverage. Only the reconstruction can establish which photos match. Unseen roofs, hidden sides, mirrors and blank walls may remain incomplete.</p>
    <p class="captureGuideLimit">${!room && scope === 'facade' ? 'Facade mode: take at least 20 overlapping photos of the accessible wall, including left, center and right viewpoints. You do not need the hidden sides or roof. The result is a private surface candidate; replacing a wall in the shared world still needs registered facade-patch support.' : `Cannot safely reach a view? Save the photos you have. This mode requires ${room ? '18 photos across all six view labels' : '20 photos across all eight view labels'} before processing. Choose facade mode for an accessible exterior wall.`} Never label the same view as a different side to pass the check.</p>
  </div>`;
}
