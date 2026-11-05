// One scoped presentation layer for game, account and standalone capture editors.
// Uses the shared product tokens in the app and standalone editors.
if (!document.getElementById('captureInterfaceTheme')) {
  const style = document.createElement('style');
  style.id = 'captureInterfaceTheme';
  style.textContent = `
  .captureWorkspaceContext{flex-basis:100%;font:12px/1.5 var(--wx-font-ui);color:var(--wx-muted,#c7c5c1)}
  dialog[data-capture-step] header{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
  .realityCaptureDialog input{min-height:44px;max-width:100%;box-sizing:border-box}.realityCaptureDialog label{display:block}
  .realityCaptureDialog{width:min(520px,94vw);max-height:85dvh;overflow:auto;padding:20px;background:var(--wx-panel-solid,#181a1e);color:var(--wx-text,#f8f7f2);border:1px solid var(--wx-line,#8b8987);font:var(--wx-type-body,14px)/1.5 var(--wx-font-ui);color-scheme:dark}
  .realityCaptureDialog button{display:block;width:100%;min-height:44px;margin-top:10px;padding:8px;background:var(--wx-panel-soft,#22252b);color:inherit;border:1px solid var(--wx-line,#8b8987);font:inherit}
  .realityCaptureDialog::backdrop{background:#000b}.realityCaptureDialog :focus-visible{outline:2px solid var(--wx-blue,#ffc098);outline-offset:3px}
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor,.captureLiveCamera){
    background:var(--wx-panel-solid,#181a1e);color:var(--wx-text,#f8f7f2);
    border-color:var(--wx-line,#8b8987);font:var(--wx-type-body,14px)/1.5 var(--wx-font-ui);color-scheme:dark;
  }
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor,.captureLiveCamera) :is(button,input,select,textarea){
    font-family:var(--wx-font-ui);font-size:var(--wx-type-control,14px);min-height:44px;
    background:var(--wx-panel-soft,#22252b);color:var(--wx-text,#f8f7f2);border-color:var(--wx-line,#8b8987);border-radius:var(--wx-radius);
  }
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor) :is(header,details,[data-capture-result],.realityCaptureTarget,.realityCaptureProcessingStatus){
    background:var(--wx-panel-soft,#22252b);border-color:var(--wx-line-soft,#8b8987);
  }
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor) :is(h2,h3,header strong){font-family:var(--wx-font-display)}
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor) :is(.primary,[data-submit],button.active){background:var(--wx-action,#ff925d);color:var(--wx-action-text,#1c1511)}
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor) :focus-visible{outline:2px solid var(--wx-blue,#ffc098);outline-offset:3px}
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor) :is(header>*,label,.fields>*,.hybridFields>*,.hybridColumns>*){min-width:0}
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor) :is(button,summary,p,h2,h3,label){overflow-wrap:anywhere;white-space:normal}
  :is(#realityCapturePanel,.homeLayoutEditor,.captureHybridEditor) :is(input,select,textarea){min-width:0;max-width:100%;box-sizing:border-box}
  .homeLayoutEditor .plan-selection{flex-wrap:wrap;min-width:0;max-width:100%}
  #realityCapturePanel summary{min-height:44px;display:flex;align-items:center;cursor:pointer}
  dialog.captureInWorld.captureInWorld{
    position:fixed;inset:12px 12px 12px auto;margin:0;width:min(760px,62vw);
    height:calc(100dvh - 24px);max-height:none;max-width:none;padding:18px;box-sizing:border-box;
    border-radius:var(--wx-radius);background:var(--wx-panel-solid,#181a1e);
    color:var(--wx-text,#f8f7f2);font:var(--wx-type-body,14px)/1.5 var(--wx-font-ui);
    border:1px solid var(--wx-line,#8b8987);overflow:auto;overscroll-behavior:contain;
  }
  dialog.captureInWorld.captureInWorld::backdrop{background:transparent}
  dialog.captureInWorld.captureInWorld header{position:sticky;top:-18px;z-index:10;background:var(--wx-panel-solid,#181a1e);padding:10px 0;border-bottom:1px solid var(--wx-line,#8b8987)}
  dialog.captureInWorld.captureInWorld h2{font:400 calc(1.5rem * var(--wx-text-scale,1))/1.3 var(--wx-font-display);margin:0}
  dialog.captureInWorld.captureInWorld [data-survey-world]{display:none}
  @media(max-width:1100px){dialog.captureInWorld .surveyColumns,dialog.captureInWorld .hybridColumns{display:flex;flex-direction:column}}
  @media(max-width:700px){dialog.captureInWorld.captureInWorld{inset:0;width:100%;height:100dvh;padding:12px;padding-bottom:max(12px,env(safe-area-inset-bottom));border-radius:0}dialog.captureInWorld.captureInWorld header{top:-12px}}
  `;
  document.head.append(style);
}
