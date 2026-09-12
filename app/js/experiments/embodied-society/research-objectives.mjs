// Operator-selected research questions, never an action sequence or a world tool.
export const RESEARCH_OBJECTIVES=Object.freeze([
 Object.freeze({id:'general-exploration',label:'General exploration',text:null}),
 Object.freeze({id:'tool-use-v1',label:'Useful-tool capability probe',text:'Obtain timber using a tool you make from gathered raw materials. Maintain your needs. Choose your own route and actions.'})
]);
export function researchObjective(id='general-exploration') {
 const objective=RESEARCH_OBJECTIVES.find(item=>item.id===id);
 if(!objective)throw Error('Unknown research objective.');
 return objective;
}
