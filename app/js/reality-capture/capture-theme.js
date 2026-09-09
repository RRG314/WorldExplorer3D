// One scoped presentation layer for game, account and standalone capture editors.
// Uses the game's interface-v4 tokens, with identical standalone fallbacks.
if (!document.getElementById('captureInterfaceTheme')) {
  const style = document.createElement('style');
  style.id = 'captureInterfaceTheme';
  style.textContent = `
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
  `;
  document.head.append(style);
}
