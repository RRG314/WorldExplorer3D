// A single marine presentation vocabulary uses the application's shell tokens.
// Session panels still own their DOM and disposal; the shared stylesheet is tiny.
export function styleMarinePanel(panel,kind) {
 if(!document.getElementById('marineInterfaceStyle')){
  const style=document.createElement('style');style.id='marineInterfaceStyle';
  style.textContent=`
  .marine-panel{position:fixed;right:14px;top:112px;z-index:120;width:232px;max-width:calc(100vw - 28px);max-height:calc(100dvh - 226px);overflow:auto;box-sizing:border-box;padding:12px;border:1px solid var(--wx-line-soft,#52636f);border-radius:8px;background:var(--wx-panel,rgba(5,12,18,.94));color:var(--wx-text,#f4f7f9);font:12px/1.5 Inter,system-ui,sans-serif;box-shadow:0 6px 24px #0003}
  .marine-panel strong{display:block;font-size:13px;font-weight:600;letter-spacing:.02em}
  .marine-panel button,.marine-panel select{box-sizing:border-box;width:100%;min-height:40px;margin-top:6px;padding:7px 9px;border:1px solid var(--wx-line-soft,#52636f);border-radius:5px;background:var(--wx-panel-soft,#101921);color:inherit;font:inherit}
  .marine-panel button:disabled{opacity:.5}.marine-panel button:not(:disabled):hover{border-color:var(--wx-blue,#2d7dff)}
  .marine-panel summary{cursor:pointer;min-height:32px;display:flex;align-items:center;color:var(--wx-muted,#a7b6c2)}
  .marine-panel [role=status]{color:var(--wx-muted,#a7b6c2);margin-top:6px}
  .marine-panel details{margin-top:8px;border-top:1px solid var(--wx-line-soft,#52636f);padding-top:4px}
  .marine-voyage{top:auto;bottom:96px}.marine-swim-inline{position:static!important;transform:none!important;max-width:none!important;width:100%!important;border:0!important;border-radius:0!important;padding:8px 0 0!important;background:none!important;box-shadow:none!important}
  .marine-swim-inline>div:last-child{display:flex;gap:4px}.marine-swim-inline button{width:auto;min-width:0;flex:1;padding:6px 4px}
  body:has(#researchDeckControls[data-active=true]) #boatPrompt{display:none}
  @media(max-width:600px){.marine-panel{top:124px;right:8px;width:184px;max-width:calc(100vw - 16px);padding:9px;max-height:calc(100dvh - 390px);font-size:11px}.marine-panel button,.marine-panel select{min-height:44px}.marine-voyage{top:auto;bottom:130px;max-height:220px}.marine-swim-inline{max-height:none!important}}
  `;document.head.append(style);
 }
 panel.removeAttribute('style');panel.classList.add('marine-panel',`marine-${kind}`);
}

export function setMarineText(element,value){if(element.textContent!==value)element.textContent=value;}
