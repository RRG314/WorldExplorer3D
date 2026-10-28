// Marine sessions own panel creation, events and removal. ScreenLayout owns
// the shared, scrollable HUD lane; panels never create a second floating stack.
import {mountHudPanel} from '../ui/hud-panel.js';

export function mountMarinePanel(panel,kind) {
 panel.classList.add('marine-panel',`marine-${kind}`);
 return mountHudPanel(panel);
}

export function setMarineText(element,value){if(element.textContent!==value)element.textContent=value;}
