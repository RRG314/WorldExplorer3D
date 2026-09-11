function classContains(element, name) {
  return element?.classList?.contains?.(name) === true;
}

function panelIsVisiblyOpen(element, content = null) {
  if (!element || element.hidden === true || element.getAttribute?.('aria-hidden') === 'true') return false;
  if (content && (content.hidden === true || classContains(content, 'hidden') || content.getAttribute?.('aria-hidden') === 'true')) {
    return false;
  }
  return classContains(element, 'show') || classContains(element, 'bar-open') || element.getAttribute?.('aria-hidden') === 'false';
}

export { panelIsVisiblyOpen };
