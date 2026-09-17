// Hot HUD paths should change the DOM only when their displayed value changes.
export function setDomText(element, value) {
  const text = value == null ? '' : String(value);
  if (element && element.textContent !== text) element.textContent = text;
}

export function setDomAttribute(element, name, value) {
  const text = String(value);
  if (element && element.getAttribute(name) !== text) element.setAttribute(name, text);
}

export function setDomHidden(element, hidden) {
  if (element && element.hidden !== !!hidden) element.hidden = !!hidden;
}

export function setDomClass(element, name, enabled) {
  if (element && element.classList.contains(name) !== !!enabled) element.classList.toggle(name, !!enabled);
}
