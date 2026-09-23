// WebGL failures are often console warnings, not uncaught page exceptions.
// They must invalidate visual acceptance even when the DOM is still usable.
export function collectBrowserGraphicsErrors(page, errors) {
  const onConsole = (message) => {
    if (!['warning', 'error'].includes(message.type())) return;
    const text = message.text();
    if (!/THREE\.WebGL(?:Program|Shader|Renderer).*\b(?:error|context lost)\b|GL_(?:INVALID_OPERATION|INVALID_VALUE|INVALID_ENUM|OUT_OF_MEMORY)|CONTEXT_LOST_WEBGL|WebGL.*context (?:was )?lost/i.test(text)) return;
    if (errors.length < 20) errors.push(`graphics: ${text.slice(0, 65536)}`);
  };
  page.on('console', onConsole);
  return () => page.off('console', onConsole);
}
