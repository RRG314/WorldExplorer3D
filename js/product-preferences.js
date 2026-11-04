import {readAccessibilityPreferences,applyAccessibilityPreferences} from '../app/js/ui/accessibility.js?v=4';
import {createLifecycleScope} from '../app/js/runtime/lifecycle-scope.js?v=2';
// Read the game's existing preferences; no second settings store or input owner.
const scope=createLifecycleScope('product-page-preferences');
const apply=()=>applyAccessibilityPreferences(readAccessibilityPreferences());
apply();
scope.listen(window,'storage',event=>{if(event.key===null||event.key==='worldExplorer3D.accessibility.v1')apply();});
scope.listen(window,'pageshow',apply);
scope.listen(window,'pagehide',event=>{if(!event.persisted)scope.dispose('page closed');});
