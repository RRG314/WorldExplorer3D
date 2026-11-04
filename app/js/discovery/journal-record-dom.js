// Both Journal readers use the same stable record identity. A data refresh
// must preserve the disclosure, keyboard focus and scroll position being read.
const rendered = new WeakMap();
export function setJournalMarkup(element, html) {
  if (!element) return false;
  const prior = rendered.get(element);
  if (
    prior?.html === html &&
    prior.first === element.firstChild &&
    prior.last === element.lastChild &&
    prior.count === element.childNodes.length
  )
    return false;
  const records = [...element.querySelectorAll('[data-journal-record]')];
  const expanded = new Map();
  let focused = null;
  for (const record of records) {
    const details = [...record.querySelectorAll('details')];
    details.forEach((node, index) => {
      const key = `${record.dataset.journalRecord}:${index}:${node.querySelector(':scope > summary')?.textContent}`;
      expanded.set(key, node.open);
      if (node.querySelector(':scope > summary') === document.activeElement) focused = key;
    });
  }
  let scroller = element;
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))
    scroller = scroller.parentElement;
  const scroll = scroller?.scrollTop;
  element.innerHTML = html;
  rendered.set(element, {
    html,
    first: element.firstChild,
    last: element.lastChild,
    count: element.childNodes.length,
  });
  for (const record of element.querySelectorAll('[data-journal-record]')) {
    [...record.querySelectorAll('details')].forEach((node, index) => {
      const summary = node.querySelector(':scope > summary');
      const key = `${record.dataset.journalRecord}:${index}:${summary?.textContent}`;
      if (expanded.has(key)) node.open = expanded.get(key);
      if (key === focused) summary?.focus({ preventScroll: true });
    });
  }
  if (scroller && Number.isFinite(scroll)) scroller.scrollTop = scroll;
  return true;
}
