/* Explicit provider fixture authoring; never installed in production or as a fetch interceptor. */
// Non-pursuit regression cases use an explicit empty increment. This builder
// never derives exits from a missing entry in an old complete array.
function fixtureDecision(input, candidate, { adopt = [], drop = [] } = {}) {
  if (!input?.self || !candidate || typeof candidate !== 'object' || candidate.type === 'recall' || (candidate.contractVersion && candidate.contractVersion !== 'npc-decision.v2')) return candidate;
  if (!candidate.type && !candidate.action) return candidate;
  const { type, target, content, purpose, intents, ...rest } = candidate;
  if (intents?.length && !adopt.length) throw Error('Fixture must explicitly adopt its non-empty pursuits');
  const action = candidate.action || { type, target, content, purpose: purpose || '' };
  delete rest.action;
  const updates = adopt.map(item => {
    const id = item.id.startsWith(input.self.id + ':') ? item.id : input.self.id + ':' + item.id;
    const old = input.self.intents?.find(node => node.id === id);
    if (old) return null; // No unsolicited semantic rewrite or version bump.
    return { operation:'upsert', id, version:0, node:{...item,id,kind:'intent',scope:item.content,satisfaction:null,parents:[]}, references:[], reason:'受控測試角色明示承接此方向' };
  }).filter(Boolean);
  for (const id of drop) {
    const old = input.self.intents.find(node => node.id === id);
    updates.push({operation:'drop',id,version:old.version,node:null,references:[],reason:'受控測試角色明示放下'});
  }
  const focus = adopt[0] ? (adopt[0].id.startsWith(input.self.id + ':') ? adopt[0].id : input.self.id + ':' + adopt[0].id) : null;
  const newPursuits=updates.filter(update=>update.operation==='upsert'&&update.version===0);
  const pursuitCandidates=newPursuits.map((update,index)=>({id:input.self.id+':candidate:fixture-'+index,kind:update.node.kind,content:update.node.content,scope:update.node.scope,satisfaction:update.node.satisfaction,references:update.references}));
  const adoptions=newPursuits.map((update,index)=>({candidateId:pursuitCandidates[index].id,pursuitId:update.id}));
  const newFocus=adoptions.find(mapping=>mapping.pursuitId===focus);
  const pursuitSelection={adoptions,declinedCandidateIds:[],focus:focus?newFocus?{kind:'candidate',id:newFocus.candidateId,version:0}:{kind:'existing',id:focus,version:input.self.intents.find(node=>node.id===focus)?.version}:null,reason:''};
  const assessment = candidate.methodAssessment ? {...candidate.methodAssessment,intentIds:candidate.methodAssessment.intentIds.map(id=>id.startsWith(input.self.id+':')?id:input.self.id+':'+id)} : {purpose:purpose||'',knownResults:[],choice:action.type==='continue'?'continue':'new',method:'',change:{kind:'not-applicable',detail:''},reason:'',selectedAction:{type:action.type,target:action.target},intentIds:focus?[focus]:[]};
  return {mood:'平靜',durationMinutes:15,timeIntent:{kind:action.type==='work'&&action.target==='tea'?'completion':['rest','reflect','continue','work','observe','say'].includes(action.type)?'open-ended':'completion',maxMinutes:null},attentionConditions:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],interpretation:'',reconfirmBodyConsequences:false,preferenceUpdates:[],habitCandidates:[],arrangementUpdates:[],...rest,contractVersion:'npc-decision.v3',pursuitContext:input.pursuitContext,pursuitCandidates,pursuitSelection,focusIntentId:focus,pursuitUpdates:updates,action,methodAssessment:assessment};
}
// The caller opts in to adopting the listed fixture intentions. Existing nodes
// retain their current scope and version; unlisted nodes are never exited.
function fixturePursuitDecision(input,candidate){return fixtureDecision(input,candidate,{adopt:candidate?.intents||[]});}
function savedPursuit(actor,item){return {...item,id:item.id.startsWith(actor+':')?item.id:actor+':'+item.id,version:1,kind:'intent',scope:item.content,satisfaction:null,parents:[],references:[],status:'active',reason:'明示合成測試起點的追求'};}
module.exports={fixtureDecision,fixturePursuitDecision,savedPursuit};
