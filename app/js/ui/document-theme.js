// Offline HTML exports borrow the active product theme at the explicit export
// boundary. They retain readable fallbacks in environments without a document.
const properties=Object.freeze(['--wx-bg','--wx-panel-solid','--wx-panel-soft','--wx-text','--wx-muted','--wx-action','--wx-action-text','--wx-line','--wx-font-ui','--wx-font-display','--wx-radius','--wx-text-scale']);
export function documentThemeCss(documentRef=globalThis.document){
  const style=documentRef?.defaultView?.getComputedStyle?.(documentRef.documentElement);
  if(!style)return '';
  const declarations=[];
  for(const name of properties){
    const value=style.getPropertyValue(name).trim();
    // A CSS scalar can never terminate the surrounding style element or rule.
    if(value&&value.length<=512&&!/[;{}<>]/.test(value))declarations.push(`${name}:${value}`);
  }
  return `:root{${declarations.join(';')}}`;
}
