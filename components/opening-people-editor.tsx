'use client';

import { Button } from '@/components/ui/button';
import { cityLimits, type CityDraft, type OpeningRelationship } from '@/lib/city-draft';

export default function OpeningPeopleEditor({ draft, names, onChange }: {
  draft: CityDraft;
  names: Map<string, string>;
  onChange: (draft: CityDraft) => void;
}) {
  const background = draft.backgroundPeople ?? [];
  const relationships = draft.relationships ?? [];

  function updateRelationship(index: number, patch: Partial<OpeningRelationship>) {
    onChange({ ...draft, relationships:relationships.map((item,i)=>i===index?{...item,...patch}:item) });
  }

  return <>
    <h2>背景人物</h2>
    <p>背景人物可出現在開局關聯，但不會加入自主生活。</p>
    {background.map((person,index)=><div className="city-person" key={person.id}>
      <label>背景人物 {index+1} 姓名<input aria-label={'背景人物 '+(index+1)+' 姓名'} maxLength={60} value={person.name}
        onChange={event=>onChange({...draft,backgroundPeople:background.map(item=>item.id===person.id?{...item,name:event.target.value}:item)})}/></label>
      <Button type="button" variant="outline" onClick={()=>onChange({
        ...draft,
        backgroundPeople:background.filter(item=>item.id!==person.id),
        relationships:relationships.filter(item=>item.targetType!=='background'||item.to!==person.id),
      })}>移除背景人物</Button>
    </div>)}
    <Button type="button" variant="outline" disabled={background.length>=cityLimits.backgroundPeople}
      onClick={()=>onChange({...draft,backgroundPeople:[...background,{id:crypto.randomUUID().slice(0,24),name:''}]})}>新增背景人物</Button>

    <h2>人物間關聯</h2>
    <p>每筆關聯只提供給填寫在「人物」的一方。若兩人都知道，請分別填寫兩筆。</p>
    {relationships.map((item,index)=><div className="city-person" key={index}>
      <label>人物<select aria-label={'關聯 '+(index+1)+' 人物'} value={item.from}
        onChange={event=>updateRelationship(index,{from:event.target.value,...(item.targetType==='character'&&item.to===event.target.value?{to:''}:{})})}>
        <option value="">請選擇</option>
        {draft.characters.map(actor=><option key={actor.templateId} value={actor.templateId}>{names.get(actor.templateId)}</option>)}
      </select></label>
      <label>對象<select aria-label={'關聯 '+(index+1)+' 對象'} value={item.to?item.targetType+':'+item.to:''}
        onChange={event=>{
          const [kind,id] = event.target.value.split(':');
          updateRelationship(index,{targetType:kind==='background'?'background':'character',to:id??''});
        }}>
        <option value="">請選擇</option>
        {draft.characters.filter(actor=>actor.templateId!==item.from).map(actor=><option key={actor.templateId} value={'character:'+actor.templateId}>{names.get(actor.templateId)}</option>)}
        {background.map(person=><option key={person.id} value={'background:'+person.id}>{person.name || '未命名背景人物'}（背景）</option>)}
      </select></label>
      <label>關聯描述<input aria-label={'關聯 '+(index+1)+' 描述'} maxLength={256} value={item.description}
        onChange={event=>updateRelationship(index,{description:event.target.value})}/></label>
      <Button type="button" variant="outline" onClick={()=>onChange({...draft,relationships:relationships.filter((_,i)=>i!==index)})}>移除人物關聯</Button>
    </div>)}
    <Button type="button" variant="outline" disabled={!draft.characters.length||relationships.length>=cityLimits.relationships}
      onClick={()=>onChange({...draft,relationships:[...relationships,{from:'',to:'',targetType:'character',description:''}]})}>新增人物關聯</Button>
  </>;
}
