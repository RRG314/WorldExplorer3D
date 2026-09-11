// One scoped presentation layer for game, account and standalone capture editors.
// Uses the game's interface-v4 tokens, with identical standalone fallbacks.
if (!document.getElementById('captureInterfaceTheme')) {
  const style = document.createElement('style');
  style.id = 'captureInterfaceTheme';
  style.textContent = `
  .captureWorkspaceContext{flex-basis:100%;font:12px/1.5 Inter,system-ui,sans-serif;color:var(--wx-text-muted,#bacbd6)}
  dialog[data-capture-step] header{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
  .realityCaptureDialog input{min-height:44px;max-width:100%;box-sizing:border-box}.realityCaptureDialog label{display:block}
  .realityCaptureDialog{width:min(520px,94vw);max-height:85dvh;overflow:auto;padding:20px;background:var(--wx-panel-solid,#071018);color:var(--wx-text,#f4f7f9);border:1px solid var(--wx-line,#53606a);font:14px/1.5 Inter,system-ui,sans-serif;color-scheme:dark}
  .realityCaptureDialog button{display:block;width:100%;min-height:44px;margin-top:10px;padding:8px;background:var(--wx-panel-soft,#101921);color:inherit;border:1px solid var(--wx-line,#53606a);font:inherit}
  .realityCaptureDialog::backdrop{background:#000b}.realityCaptureDialog :focus-visible{outline:2px solid var(--wx-blue,#2d7dff);outline-offset:3px}
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor,.captureLiveCamera){
    background:var(--wx-panel-solid,#071018);color:var(--wx-text,#f4f7f9);
    border-color:var(--wx-line,#53606a);font:14px/1.5 Inter,system-ui,sans-serif;color-scheme:dark;
  }
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor,.captureLiveCamera) :is(button,input,select,textarea){
    font-family:Inter,system-ui,sans-serif;font-size:14px;min-height:44px;
    background:var(--wx-panel-soft,#101921);color:var(--wx-text,#f4f7f9);border-color:var(--wx-line,#53606a);border-radius:4px;
  }
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor) :is(header,details,[data-capture-result],.realityCaptureTarget,.realityCaptureProcessingStatus){
    background:var(--wx-panel-soft,#101921);border-color:var(--wx-line-soft,#53606a);
  }
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor) :is(h2,h3,header strong){font-family:Orbitron,Inter,system-ui,sans-serif}
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor) :is(.primary,[data-submit],button.active){background:var(--wx-blue,#2d7dff);color:white}
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor) :focus-visible{outline:2px solid var(--wx-blue,#2d7dff);outline-offset:3px}
  #realityCapturePanel summary{min-height:44px;display:flex;align-items:center;cursor:pointer}
  dialog.captureInWorld.captureInWorld{
    position:fixed;inset:12px 12px 12px auto;margin:0;width:min(760px,62vw);
    height:calc(100dvh - 24px);max-height:none;max-width:none;padding:18px;box-sizing:border-box;
    border-radius:4px;background:var(--wx-panel-solid,#071018);
    color:var(--wx-text,#f4f7f9);font:14px/1.5 Inter,system-ui,sans-serif;
    border:1px solid var(--wx-line,#53606a);overflow:auto;overscroll-behavior:contain;
  }
  dialog.captureInWorld.captureInWorld::backdrop{background:transparent}
  dialog.captureInWorld.captureInWorld header{position:sticky;top:-18px;z-index:10;background:var(--wx-panel-solid,#071018);padding:10px 0;border-bottom:1px solid var(--wx-line,#53606a)}
  dialog.captureInWorld.captureInWorld h2{font:700 17px/1.4 Orbitron,Inter,sans-serif;margin:0}
  dialog.captureInWorld.captureInWorld [data-survey-world]{display:none}
  @media(max-width:1100px){dialog.captureInWorld .surveyColumns,dialog.captureInWorld .hybridColumns{display:flex;flex-direction:column}}
  @media(max-width:700px){dialog.captureInWorld.captureInWorld{inset:0;width:100%;height:100dvh;padding:12px;padding-bottom:max(12px,env(safe-area-inset-bottom));border-radius:0}dialog.captureInWorld.captureInWorld header{top:-12px}}
  `;
  document.head.append(style);
}
