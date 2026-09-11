const DIAG_KEY = "__WE3D_STARTUP_DIAGNOSTICS__";
const MAX_EVENTS = 60;

function getDiagnosticsState() {
  if (!globalThis[DIAG_KEY]) {
    globalThis[DIAG_KEY] = {
      startedAt: Date.now(),
      env: {
        href: typeof location !== "undefined" ? location.href : "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        platform: typeof navigator !== "undefined" ? navigator.platform || "" : "",
        language: typeof navigator !== "undefined" ? navigator.language || "" : ""
      },
      events: [],
      panelVisible: false
    };
  }
  return globalThis[DIAG_KEY];
}

function formatValue(value) {
  if (value == null) return String(value);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function renderPanel(state, title = "Startup diagnostics") {
  if (typeof document === "undefined" || !document.body) return;
  let panel = document.getElementById("startupDiagnosticsPanel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "startupDiagnosticsPanel";
    panel.style.cssText = [
      "position:fixed",
      "left:16px",
      "right:16px",
      "bottom:16px",
      "max-height:45vh",
      "overflow:auto",
      "z-index:2147483647",
      "background:rgba(5,10,18,0.95)",
      "color:#e5eefc",
      "border:1px solid rgba(120,160,255,0.35)",
      "border-radius:10px",
      "box-shadow:0 18px 60px rgba(0,0,0,0.45)",
      "padding:14px",
      "font:12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
      "white-space:pre-wrap"
    ].join(";");
    document.body.appendChild(panel);
  }

  const lines = [];
  lines.push(title);
  lines.push("");
  lines.push(`URL: ${state.env.href}`);
  lines.push(`Platform: ${state.env.platform}`);
  lines.push(`Language: ${state.env.language}`);
  lines.push(`User agent: ${state.env.userAgent}`);
  lines.push("");
  state.events.forEach((event) => {
    lines.push(`[${event.ms}ms] ${event.scope}: ${event.message}`);
    if (event.detail) {
      lines.push(formatValue(event.detail));
    }
    lines.push("");
  });
  panel.textContent = lines.join("\n");
  state.panelVisible = true;
}

export function initStartupDiagnostics() {
  return getDiagnosticsState();
}

export function recordStartupDiagnostic(scope, message, detail = null) {
  const state = getDiagnosticsState();
  state.events.push({
    ms: Date.now() - state.startedAt,
    scope: String(scope || "app"),
    message: String(message || ""),
    detail
  });
  if (state.events.length > MAX_EVENTS) {
    state.events.splice(0, state.events.length - MAX_EVENTS);
  }
  return state;
}

export function showStartupDiagnostics(title = "Startup diagnostics") {
  const state = getDiagnosticsState();
  renderPanel(state, title);
  return state;
}

export function summarizeStartupError(error) {
  return {
    name: error?.name || null,
    message: error?.message || null,
    stack: error?.stack || null,
    cause: error?.cause || null
  };
}
