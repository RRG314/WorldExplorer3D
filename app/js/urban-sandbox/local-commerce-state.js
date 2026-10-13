// Pure local transaction preparation. Gameplay and save listeners run only
// after money, inventory, stock and (where applicable) housing have committed.
export function localCommerceState(value) {
  if (value == null) return {schemaVersion:4,revision:0,credits:1000000,purchases:{},claimedTrades:{},pendingSettlements:{},transactions:[]};
  if (typeof value !== 'object' || Array.isArray(value) || !Number.isInteger(Number(value.schemaVersion || 1)) || Number(value.schemaVersion || 1) > 4) throw Error('Unsupported local wallet');
  const credits = Number(value.credits) * (Number(value.schemaVersion || 1) < 4 ? 2000 : 1);
  if (!Number.isSafeInteger(credits) || credits < 0) throw Error('Invalid local wallet balance');
  return {schemaVersion:4,revision:Math.max(0,Number(value.revision)||0),credits,
    purchases:{...value.purchases},claimedTrades:{...value.claimedTrades},pendingSettlements:{...value.pendingSettlements},
    transactions:Array.isArray(value.transactions)?value.transactions.slice(-60):[]};
}

export function commerceChange(state, delta, type, detail, at) {
  if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(state.credits + delta)) return {ok:false,reason:'invalid_amount'};
  if (state.credits + delta < 0) return {ok:false,reason:'not_enough_credits'};
  return {ok:true,next:{...state,revision:state.revision+1,credits:state.credits+delta,
    purchases:{...state.purchases},claimedTrades:{...state.claimedTrades},pendingSettlements:{...state.pendingSettlements},
    transactions:[...state.transactions.slice(-59),{...detail,type,credits:Math.abs(delta),at}]}};
}

export function withCommerceItem(raw, definition, store, provenance, at) {
  if (!raw?.items || !definition) return null;
  const existing=raw.items.find(item=>item.catalogId===definition.id);
  const item={instanceId:existing?.instanceId || `commerce:${definition.id}`,catalogId:definition.id,
    quantity:(Number(existing?.quantity)||0)+1,authority:'anonymous-local',provenance,sourceEventId:'',tradeable:true,acquiredAt:at,
    metadata:{label:definition.label,category:definition.category,icon:definition.icon,verbs:definition.verbs,description:definition.description,
      conditionRestore:Number(definition.conditionRestore||0),consumeLabel:String(definition.consumeLabel||''),commerceSellValue:definition.sellPrice,
      storeId:store.id,storeName:store.name}};
  return {...raw,revision:(raw.revision||0)+1,items:[...raw.items.filter(entry=>entry!==existing),item]};
}

export function withoutCommerceItems(raw, identity, amount) {
  if (!raw?.items || !Number.isSafeInteger(amount) || amount < 1) return null;
  const matches=raw.items.filter(item=>item.instanceId===identity || item.catalogId===identity);
  if (matches.reduce((sum,item)=>sum+item.quantity,0)<amount) return null;
  let remaining=amount;
  const items=raw.items.flatMap(item=>{
    if (!matches.includes(item) || !remaining) return [item];
    const used=Math.min(item.quantity,remaining);remaining-=used;
    return item.quantity>used?[{...item,quantity:item.quantity-used}]:[];
  });
  const ids=new Set(items.map(item=>item.instanceId));
  return {...raw,revision:(raw.revision||0)+1,items,hotbar:(raw.hotbar||[]).map(id=>ids.has(id)?id:null),
    equippedInstanceId:ids.has(raw.equippedInstanceId)?raw.equippedInstanceId:null};
}
