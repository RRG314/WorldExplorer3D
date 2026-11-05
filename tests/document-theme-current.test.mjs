import test from 'node:test';
import assert from 'node:assert/strict';
import {documentThemeCss} from '../app/js/ui/document-theme.js';
const documentFor=values=>({documentElement:{},defaultView:{getComputedStyle:()=>({getPropertyValue:name=>values[name]||''})}});
test('offline documents capture the current appearance without loading the application stylesheet',()=>{
 const before={'--wx-text':'#f8f7f2','--wx-panel-solid':'#181a1e','--wx-action':'#ff925d','--wx-font-ui':'Arial, sans-serif','--wx-font-display':'Impact, "Arial Narrow", sans-serif'};
 const css=documentThemeCss(documentFor(before));
 assert.match(css,/--wx-action:#ff925d/);assert.match(css,/--wx-font-display:Impact/);
 const after=documentThemeCss(documentFor({...before,'--wx-action':'#9c3d15'}));assert.notEqual(css,after);assert.match(css,/--wx-action:#ff925d/);
 assert.doesNotMatch(css,/https?:|@import|url\(/);
});
test('a document without browser styling retains the export fallback and style values cannot escape their rule',()=>{
 assert.equal(documentThemeCss(undefined),'');
 const css=documentThemeCss(documentFor({'--wx-text':'#fff;}</style><script>bad()</script>','--wx-action':'#ff925d','unknown':'private'}));
 assert.equal(css,':root{--wx-action:#ff925d}');assert.doesNotMatch(css,/script|private/);
});
