'use client';

import {saveNutrition} from '../app/nutrition-actions';
import {useMealPreview} from '../lib/meal-preview-client';
import {maxMealText,mealPreviewTotals,type MealPreview} from '../lib/meal-preview';
import {meals,unitsFor,type Meal,type Portion} from '../lib/nutrition';

export function MealPreviewForm({day,meal,disabled,initialText,initialPreview,requestId,onSaved,onDraftChange,onConfirmationLock,close}:{
  day:string;meal?:Meal;disabled:boolean;initialText?:string;initialPreview?:MealPreview;requestId?:string;onSaved?:()=>void;close?:()=>void;
  onDraftChange?:(description:string)=>void;onConfirmationLock?:(locked:boolean)=>void;
}){
  const draft=useMealPreview({day,meal,initialText,initialPreview,onSaved,onDraftChange,onConfirmationLock,randomId:()=>requestId??crypto.randomUUID(),
    async preview(text){
      const response=await fetch('/api/mobile',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'meal-preview',text})});
      const result=await response.json() as {preview?:MealPreview;error?:string};
      if(!response.ok||!result.preview) throw new Error(result.error??'Meal preview is unavailable.');
      return result.preview;
    },
    async save(command){
      const result=await saveNutrition(command);
      if(!result.ok) throw new Error(result.error);
    },
  });
  const locked=disabled||Boolean(draft.state)||draft.retry;
  return <section className="panel meal-preview" aria-label="Describe a meal">
    <form onSubmit={event=>{event.preventDefault();if(!locked) draft.start();}}>
      <label>Describe a meal
        <textarea rows={1} placeholder="Lunch: 40 g oats and 200 ml milk" value={draft.text} disabled={locked}
          maxLength={maxMealText} onChange={event=>draft.setText(event.target.value)}/>
      </label>
      <button className="button secondary" disabled={locked||!draft.text.trim()}>{draft.state==='preview'?'Finding foods…':'Preview meal'}</button>
    </form>
    {draft.rows.length>0&&<div className="meal-preview-rows">
      <label>Meal<select aria-label="Preview meal slot" value={draft.meal} disabled={locked} onChange={event=>draft.setMeal(event.target.value as Meal)}>
        {meals.map(option=><option key={option}>{option}</option>)}
      </select></label>
      {draft.rows.map((row,index)=><div key={index} className="meal-preview-row">
        <label>Product<select aria-label={`Product for ${row.line.query}`} disabled={locked}
          value={row.food?.source==='Custom label'?'custom':row.food?String(row.line.foods.indexOf(row.food)):''}
          onChange={event=>event.target.value==='custom'?draft.custom(index):draft.pick(index,row.line.foods[Number(event.target.value)])}>
          <option value="" disabled>{row.line.unavailable?'Search unavailable':row.line.foods.length?'Choose '+row.line.query:'No match for '+row.line.query}</option>
          {row.line.foods.map((food,i)=><option key={i} value={i}>{[food.name,food.brand].filter(Boolean).join(' · ')}</option>)}
          <option value="custom">Use {row.line.query} as custom food</option>
        </select></label>
        <label>Amount<input aria-label={`Amount for ${row.line.query}`} inputMode="decimal" value={row.amount} disabled={locked}
          onChange={event=>draft.editAmount(index,event.target.value)}/></label>
        <label>Unit<select aria-label={`Unit for ${row.line.query}`} value={row.unit} disabled={locked||!row.food}
          onChange={event=>draft.editUnit(index,event.target.value as Portion['unit'])}>
          {(row.food?unitsFor(row.food):[row.unit]).map(unit=><option key={unit}>{unit}</option>)}
        </select></label>
        <button className="quiet" aria-label={`Remove ${row.line.query}`} disabled={locked} onClick={()=>draft.remove(index)}>Remove</button>
      </div>)}
      <div className="nut-between">
        <small>{draft.canConfirm?mealPreviewTotals(draft.portions):'Choose products and enter amounts to confirm.'}</small>
        <button className="button" disabled={disabled||Boolean(draft.state)||!draft.canConfirm} onClick={draft.confirm}>
          {draft.state==='save'?'Saving…':draft.retry?'Retry confirmation':'Confirm meal'}
        </button>
      </div>
    </div>}
    {draft.message&&<p role="status" className="muted">{draft.message}</p>}
    {close&&<button className="quiet" disabled={Boolean(draft.state)||draft.retry} onClick={close}>Back to chat</button>}
  </section>;
}
