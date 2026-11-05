const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
export function renderCareerMilestones(ui, portfolio) {
  const rows = [...portfolio.careers].sort(
    (a, b) =>
      Number(b.following) - Number(a.following) ||
      b.completedStudies - a.completedStudies ||
      b.done - a.done ||
      a.label.localeCompare(b.label)
  );
  ui.titleList.innerHTML =
    `<li class="career-board-summary"><strong>${escape(portfolio.name)} · ${portfolio.achievements.length} earned achievements</strong><button type="button" data-open-player-journey>Open Your journey</button></li>` +
    rows
      .map(
        (c) =>
          `<li class="career-board-row"><div><strong>${escape(c.label)}${c.following ? ' · Following' : ''}</strong><small>${escape(c.title || 'Saved pursuit')}</small></div><span>${c.total ? `${c.done}/${c.total} practical stages` : 'Open pursuit for your next step'}${c.completedStudies ? ` · ${c.completedStudies} saved studies` : ''}</span></li>`
      )
      .join('');
}
