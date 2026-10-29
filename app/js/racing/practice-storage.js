export const racingPracticeNamespace=uid=>uid?`:account:${uid}`:':guest-racing';
export function racingPracticeStorage(uid,source=globalThis.localStorage){
 const namespace=racingPracticeNamespace(uid);
 return {getItem:key=>source?.getItem(key+namespace),setItem:(key,value)=>source?.setItem(key+namespace,value)};
}
