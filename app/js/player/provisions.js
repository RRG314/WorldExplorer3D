// One consumer for backpack supplies and the existing condition authority.
// Does not create provisions or maintain a parallel health/inventory store.
export function consumePlayerProvision(inventory,condition,item){
 const restore=Math.max(0,Number(item?.metadata?.conditionRestore||item?.conditionRestore||0));
 if(!restore||!Number.isFinite(restore))return {ok:false,reason:'not_consumable'};
 if(!condition?.snapshot||condition.snapshot().condition>=.999)return {ok:false,reason:'full_health'};
 const consume=inventory?.consumeItem||inventory?.consume;
 if(!consume||!consume.call(inventory,item.instanceId,1))return {ok:false,reason:'inventory_unavailable'};
 const result=condition.restore(restore,`consumed:${item.catalogId}`);
 return {ok:true,condition:result.after};
}
