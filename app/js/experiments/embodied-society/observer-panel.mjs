import {inventoryTotals,itemLabel} from './observer-report.mjs';
export function createObserverPanel(document) {
 const panel=document.createElement('section');panel.setAttribute('aria-label','Embodied research controls');
 panel.style.cssText='position:fixed;z-index:12000;right:12px;top:72px;width:300px;max-width:calc(100vw - 48px);padding:12px;background:#102732;color:#eff9fc;border:1px solid #4b8494;border-radius:8px;font:14px/1.5 system-ui;max-height:65vh;overflow:auto';
 panel.innerHTML=`<div style="display:flex;align-items:center;gap:10px;justify-content:space-between"><strong>AI resident</strong><button type="button" data-minimize aria-expanded="true" aria-controls="research-observer-content">Minimize</button></div>
 <div data-compact hidden><span data-compact-status>Ready</span><br><span data-compact-inventory>Inventory: empty</span></div>
 <div id="research-observer-content" data-content><p data-status>Checking research configuration…</p>
 <strong>Resident inventory</strong><p style="font-size:12px;margin:4px 0">Separate from your player backpack.</p><ul data-inventory><li>Empty</li></ul>
 <p data-needs></p><p data-details></p>
 <button data-start disabled>Start AI resident</button> <button data-pause disabled>Pause</button> <button data-end disabled>End run</button>
 <p><button data-report disabled>Download decision report</button></p>
 <details data-panel><summary>Experiment settings</summary><label>Research objective <select data-objective></select></label><p data-task></p><label>Initial conditions <select data-profile><option value="baseline">Original full-needs pilot</option><option value="resource-use-v1">Hungry/thirsty, supplies beyond reach</option></select></label></details></div>`;
 const el=name=>panel.querySelector(`[data-${name}]`);
 panel.querySelectorAll('label').forEach(label=>label.style.cssText='display:block;margin:8px 0');
 panel.querySelectorAll('select').forEach(select=>select.style.cssText='display:block;width:100%');
 el('minimize').onclick=()=>{
  const minimized=!el('content').hidden;el('content').hidden=minimized;el('compact').hidden=!minimized;
  el('minimize').textContent=minimized?'Expand':'Minimize';el('minimize').setAttribute('aria-expanded',String(!minimized));
  panel.style.width=minimized?'210px':'300px';
 };
 let prior='';
 function updateInventory(items){
  const totals=inventoryTotals(items),signature=JSON.stringify(totals);if(signature===prior)return;prior=signature;
  el('inventory').replaceChildren();
  for(const [id,quantity] of Object.entries(totals)){const li=document.createElement('li');li.textContent=`${itemLabel(id)} × ${quantity}`;el('inventory').append(li);}
  if(!Object.keys(totals).length){const li=document.createElement('li');li.textContent='Empty';el('inventory').append(li);}
  el('compact-inventory').textContent=Object.entries(totals).map(([id,n])=>`${itemLabel(id)} × ${n}`).join(' · ')||'Inventory: empty';
 }
 return {panel,el,updateInventory};
}
