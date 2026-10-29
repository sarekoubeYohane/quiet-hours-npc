const {decision,upsert}=require('./pursuit-graph-fixture.cjs');
const assess=(input,id,status,progress,kind='known-result',references)=>({operation:'assess',id,version:input.self.intents.find(n=>n.id===id).version,node:{status,progress,basis:{kind,text:kind==='known-result'?'依我剛才實際知道的結果判斷':'我現在主觀上覺得夠了'}},references:references??input.self.shortTerm.slice(-1).map(m=>({kind:'short',id:m.id,version:m.version})),reason:'我依自己的標準重新評估'});
module.exports={assess,decision,upsert};
