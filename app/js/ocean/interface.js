// Marine sessions own panel creation, events and removal. ScreenLayout owns
// the shared, scrollable HUD lane; panels never create a second floating stack.
export function mountMarinePanel(panel,kind) {
 panel.removeAttribute('style');panel.classList.add('marine-panel',`marine-${kind}`);
 const host=document.getElementById('hudUtilities')||document.body;
 const footer=host.querySelector('.hudUtilityActions');
 host.insertBefore(panel,footer?.parentNode===host?footer:null);
 return panel;
}

export function setMarineText(element,value){if(element.textContent!==value)element.textContent=value;}
