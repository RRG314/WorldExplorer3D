import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

// Opt-in investigation evidence, not a change to rendering, shaders or errors.
// The normal acceptance collector still rejects every graphics failure.
export async function installBrowserGraphicsProbe(page, outputPath, phase = () => '') {
  await page.addInitScript(() => {
    globalThis.__we3dGraphicsEvents = [];
    for (const type of ['webglcontextlost', 'webglcontextrestored']) {
      document.addEventListener(type, event => {
        const events = globalThis.__we3dGraphicsEvents;
        if (events.length < 16) events.push({ type, at: performance.now(), canvasId: event.target?.id || '', status: event.statusMessage || '' });
      }, true);
    }
  });
  let captured = false;
  page.on('console', message => {
    if (captured || !['error', 'warning'].includes(message.type()) ||
        !/shader error|WebGL:.*INVALID_OPERATION|GL_OUT_OF_MEMORY|CONTEXT_LOST_WEBGL|context (?:was )?lost/i.test(message.text())) return;
    captured = true;
    const report = { at: new Date().toISOString(), phase: phase(), firstMessage: message.text() };
    if (process.env.CI) {
      report.hostMemory = { total: os.totalmem(), free: os.freemem() };
      try { report.hostProcesses = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,comm='], { encoding: 'utf8', timeout: 2000 }); }
      catch (error) { report.hostProcessError = error.message; }
    }
    // Capture promptly, while the failing context still exists. Do not call
    // getError(), clear errors, restore contexts, or alter shader compilation.
    page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const renderer = ctx.renderer;
      const gl = renderer?.getContext?.();
      const lost = gl?.isContextLost?.();
      const debug = !lost && gl?.getExtension('WEBGL_debug_renderer_info');
      const programs = renderer?.info?.programs || [];
      const failed = !lost && gl ? programs.filter(entry => !gl.getProgramParameter(entry.program, gl.LINK_STATUS)).slice(0, 3).map(entry => ({
        id: entry.id,
        log: gl.getProgramInfoLog(entry.program),
        shaders: (gl.getAttachedShaders(entry.program) || []).map(shader => ({
          type: gl.getShaderParameter(shader, gl.SHADER_TYPE),
          compiled: gl.getShaderParameter(shader, gl.COMPILE_STATUS),
          log: gl.getShaderInfoLog(shader),
          source: gl.getShaderSource(shader)
        }))
      })) : [];
      return {
        contextLost: lost, contextEvents: globalThis.__we3dGraphicsEvents,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
        maxTextures: !lost && gl ? gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) : null,
        memory: renderer?.info?.memory, render: renderer?.info?.render,
        programs: programs.length, failedPrograms: failed,
        heap: performance.memory ? { used: performance.memory.usedJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null,
        gameStarted: ctx.gameStarted, worldLoading: ctx.worldLoading,
        environment: ctx.getEnv?.(), canvasCount: document.querySelectorAll('canvas').length
      };
    }).then(state => { report.state = state; }, error => { report.captureError = String(error); })
      .then(async () => { await mkdir(path.dirname(outputPath), { recursive: true }); await writeFile(outputPath, JSON.stringify(report, null, 2)); })
      .catch(error => console.error('Could not retain graphics investigation evidence:', error.message));
  });
}
