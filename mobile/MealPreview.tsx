import {Text,TextInput,View} from 'react-native';
import {uuid} from 'expo';
import {useState} from 'react';
import type {Session} from '@supabase/supabase-js';
import {useMealPreview} from '../lib/meal-preview-client';
import {maxMealText,mealPreviewTotals,type MealPreview} from '../lib/meal-preview';
import {meals,unitsFor} from '../lib/nutrition';
import {mobileRequest} from './session';
import {Button,ui,type Palette} from './ui';

export function MobileMealPreview({day,p,session,refresh,initialText,close}:{day:string;p:Palette;session:Session;refresh:()=>void;initialText?:string;close?:()=>void}){
  const [choosing,setChoosing]=useState<number>();
  const draft=useMealPreview({day,initialText,randomId:uuid.v4,
    async preview(text){
      const result=await mobileRequest<{preview:MealPreview}>(session,'/api/mobile',{action:'meal-preview',text});
      return result.preview;
    },
    async save(command){
      await mobileRequest(session,'/api/mobile',{action:'nutrition',command});
      refresh();
    },
  });
  const locked=Boolean(draft.state)||draft.retry;
  const input=[ui.input,{color:p.text,borderColor:p.line}];
  const caption=[ui.text,{color:p.muted}];
  return <View style={[ui.panel,{backgroundColor:p.panel,borderColor:p.line}]}>
    <Text style={[ui.section,{color:p.text}]}>Describe a meal</Text>
    <TextInput accessibilityLabel="Describe a meal" placeholder="Lunch: 40 g oats and 200 ml milk" placeholderTextColor={p.muted}
      style={input} multiline editable={!locked} maxLength={maxMealText} value={draft.text} onChangeText={draft.setText}/>
    <Button p={p} disabled={locked||!draft.text.trim()} text={draft.state==='preview'?'Finding foods…':'Preview meal'} action={draft.start}/>
    {draft.rows.length>0&&<>
      <View style={ui.row}>{meals.map(meal=><Button p={p} key={meal} text={meal} accent={draft.meal===meal} disabled={locked} action={()=>draft.setMeal(meal)}/>)}</View>
      {draft.rows.map((row,index)=><View key={index} style={{gap:6,paddingTop:8,borderTopWidth:1,borderColor:p.line}}>
        <Text style={caption}>{row.food?.name??row.line.query}</Text>
        {row.line.unavailable&&<Text style={caption}>Product search unavailable</Text>}
        {row.food&&choosing!==index?<Button p={p} text="Change product" disabled={locked} action={()=>setChoosing(index)}/>:<>
          {row.line.foods.map((food,i)=><Button p={p} key={i} text={[food.name,food.brand].filter(Boolean).join(' · ')}
            accent={row.food===food} disabled={locked} action={()=>{draft.pick(index,food);setChoosing(undefined);}}/>)}
          <Button p={p} text="Use as custom food" accent={row.food?.source==='Custom label'} disabled={locked}
            action={()=>{draft.custom(index);setChoosing(undefined);}}/>
        </>}
        <View style={ui.row}>
          <TextInput accessibilityLabel={'Amount for '+row.line.query} keyboardType="decimal-pad" placeholder="Amount" placeholderTextColor={p.muted}
            style={[...input,{flex:1,minWidth:85}]} value={row.amount} editable={!locked} onChangeText={value=>draft.editAmount(index,value)}/>
          {(row.food?unitsFor(row.food):[row.unit]).map(unit=><Button p={p} key={unit} text={unit} accent={row.unit===unit} disabled={locked||!row.food}
            action={()=>draft.editUnit(index,unit)}/>)}
          <Button p={p} text="Remove" disabled={locked} action={()=>draft.remove(index)}/>
        </View>
      </View>)}
      {draft.canConfirm&&<Text style={caption}>{mealPreviewTotals(draft.portions)}</Text>}
      <Button p={p} accent disabled={Boolean(draft.state)||!draft.canConfirm} text={draft.state==='save'?'Saving…':draft.retry?'Retry confirmation':'Confirm meal'} action={draft.confirm}/>
    </>}
    {draft.message&&<Text style={caption} accessibilityLiveRegion="polite">{draft.message}</Text>}
    {close&&<Button p={p} text="Back to chat" disabled={Boolean(draft.state)||draft.retry} action={close}/>}
  </View>;
}
