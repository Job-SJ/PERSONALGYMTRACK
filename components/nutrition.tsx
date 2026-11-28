'use client';

import {useRef,useState,type FormEvent} from 'react';
import {ChevronLeft,ChevronRight,Plus,Utensils} from 'lucide-react';
import {saveNutrition} from '../app/nutrition-actions';
import {labels,meals,portionValues,shiftDay,sumPortions,type Entry,type Food,type LibraryItem,type Meal,type Portion,type Target} from '../lib/nutrition';
import type {Measurement} from '../lib/model';
import {amount,macros,NutritionCharts,type Intake,type StrengthPoint} from './nutrition-charts';
import {FoodEditor,FoodSearch,NutrientValues,PortionEditor,type RecentSearch} from './nutrition-food';
import {NutritionTargets} from './nutrition-targets';
import {adaptiveMaintenance} from '../lib/adaptive-nutrition';
import {MealPreviewForm} from './meal-preview';

type Props={today:string;entries:Entry[];targets:Target[];library:LibraryItem[];complete:string[];weights:Measurement[];strength:StrengthPoint[];setup?:boolean};
type Draft={portion:Portion;id?:string;favoriteId?:string};
const tabs=['Diary','Trends','Favorites & recipes','Targets'] as const;

export function Nutrition({today,entries,targets,library,complete,weights,strength,setup=false}:Props){
  const [day,setDay]=useState(today);
  const [tab,setTab]=useState<typeof tabs[number]>('Diary');
  const [meal,setMeal]=useState<Meal>('Breakfast');
  const [draft,setDraft]=useState<Draft>();
  const [editingFood,setEditingFood]=useState<Food|null>();
  const [recipe,setRecipe]=useState<{id?:string;name:string;servings:number;portions:Portion[]}>();
  const [recipeIndex,setRecipeIndex]=useState<number>();
  const [foodSearch,setFoodSearch]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [saveMeal,setSaveMeal]=useState<Meal>();
  const [recentSearches,setRecentSearches]=useState<RecentSearch[]>([]);
  const lock=useRef(false);
  const editor=useRef<HTMLElement>(null);
  const groups=new Map<string,Portion[]>();
  for(const entry of entries){
    const group=groups.get(entry.day)??[];
    group.push(entry.portion);groups.set(entry.day,group);
  }
  const confirmed=new Set(complete);
  const intake=new Map<string,Intake>();
  for(const date of new Set([...groups.keys(),...confirmed])) intake.set(date,{values:sumPortions(groups.get(date)??[]),complete:confirmed.has(date)});
  const current=entries.filter(entry=>entry.day===day);
  const target=targets.find(row=>row.day<=day);
  const daily=intake.get(day)?.values??sumPortions([]);
  const knownCalories=sumPortions(current.filter(entry=>portionValues(entry.portion).kcal!=null).map(entry=>entry.portion)).kcal??0;
  const remaining=target?target.kcal-knownCalories:null;
  const latestWeight=weights.find(row=>row.day<=day)?.value;
  const recent=[...new Map([...entries].sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(({portion})=>[JSON.stringify(portion.food),portion])).values()].reverse().slice(0,6);
  const progress=target?Math.min(100,knownCalories/target.kcal*100):0;
  const period=(length:number)=>{
    const start=shiftDay(day,1-length);
    const recorded=[...intake].filter(([date,row])=>date>=start&&date<=day&&row.complete&&row.values.kcal!=null);
    return {count:recorded.length,mean:recorded.length?recorded.reduce((total,[,row])=>total+(row.values.kcal??0),0)/recorded.length:null};
  };
  function showEditor(){
    requestAnimationFrame(()=>{editor.current?.scrollIntoView({block:'nearest'});editor.current?.focus({preventScroll:true});});
  }
  function openSearch(nextMeal:Meal){
    setTab('Diary');setMeal(nextMeal);setDraft(undefined);setEditingFood(undefined);setFoodSearch(true);showEditor();
  }
  function pick(portion:Portion,favoriteId?:string){
    setDraft({portion,favoriteId});setEditingFood(undefined);showEditor();
  }
  function closeEditor(){setDraft(undefined);setEditingFood(undefined);setFoodSearch(false);setRecipeIndex(undefined);}
  async function persist(command:unknown,success:string){
    if(lock.current||setup) return false;
    lock.current=true;setBusy(true);setMessage('');
    try{
      const result=await saveNutrition(command);
      setMessage(result.error??success);
      return !result.error;
    }catch{setMessage('Could not save your changes. Try again.');return false;}
    finally{lock.current=false;setBusy(false);}
  }
  async function submitPortion(event:FormEvent){
    event.preventDefault();
    if(!draft) return;
    if(recipe){
      const portions=[...recipe.portions];
      if(recipeIndex===undefined) portions.push(draft.portion);
      else portions[recipeIndex]=draft.portion;
      setRecipe({...recipe,portions});closeEditor();return;
    }
    if(await persist({type:'log',id:draft.id,day,meal,portions:[draft.portion]},draft.id?'Entry updated.':'Food logged.')) closeEditor();
  }
  function correct(food:Food){
    setEditingFood(undefined);
    setDraft(previous=>({id:previous?.id,favoriteId:previous?.favoriteId,
      portion:{food,amount:previous?.portion.unit===food.basis?previous.portion.amount:food.basis==='serving'?1:100,unit:food.basis},
    }));
  }
  async function favorite(){
    if(!draft) return;
    const {portion}=draft;
    if(await persist({type:'library',id:draft.favoriteId,name:portion.food.name,kind:'food',portions:[portion],servings:1},'Favorite saved.')) closeEditor();
  }
  function changeDay(date:string){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today||date<'1900-01-01') return;
    setDay(date);setMessage('');setSaveMeal(undefined);closeEditor();
  }
  function changeTab(next:typeof tabs[number]){
    setTab(next);closeEditor();setRecipe(undefined);setSaveMeal(undefined);setMessage('');
  }
  function openFavorite(item:LibraryItem){
    setTab('Diary');setFoodSearch(true);pick(item.portions[0],item.id);
  }
  const mealSelect=<label className="nut-field">Meal<select aria-label="Meal" value={meal} onChange={event=>setMeal(event.target.value as Meal)}>{meals.map(name=><option key={name}>{name}</option>)}</select></label>;
  return <div className="nutrition">
    <header className="nut-heading">
      <div><h1>Nutrition</h1><p className="muted">Food diary, targets and intake trends.</p></div>
      <button className="button" disabled={setup||busy} onClick={()=>{setRecipe(undefined);openSearch(meal);}}><Plus size={17}/> Log food</button>
    </header>
    {setup&&<p className="notice" role="status">Connect Supabase and apply the nutrition migration to save foods and targets.</p>}
    <div className="nut-between nut-toolbar">
      <nav className="nut-tabs" aria-label="Nutrition sections">{tabs.map(name=><button type="button" className="quiet" key={name} aria-pressed={name===tab} onClick={()=>changeTab(name)}>{name}</button>)}</nav>
      <div className="nut-controls nut-date">
        <button className="quiet" type="button" aria-label="Previous day" disabled={busy||day==='1900-01-01'} onClick={()=>changeDay(shiftDay(day,-1))}><ChevronLeft size={17}/></button>
        <input aria-label="Diary date" type="date" value={day} min="1900-01-01" max={today} disabled={busy} onChange={event=>changeDay(event.target.value)}/>
        <button className="quiet" type="button" aria-label="Next day" disabled={busy||day>=today} onClick={()=>changeDay(shiftDay(day,1))}><ChevronRight size={17}/></button>
        <button className="quiet" type="button" disabled={busy||day===today} onClick={()=>changeDay(today)}>Today</button>
      </div>
    </div>
    {message&&<p className="notice nut-message" role="status">{message}</p>}
    {tab==='Diary'&&<>
      {!setup&&<MealPreviewForm key={day} day={day} meal={meal} disabled={busy}/>}
      <div className="nut-grid nut-overview">
        <section className="panel nut-panel nut-energy">
          <div className="nut-ring" role="img" aria-label={target?`${Math.round(knownCalories/target.kcal*100)} percent of calorie target logged`:'No calorie target set'}>
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="nut-ring-track" cx="60" cy="60" r="51" pathLength="100"/>
              <circle className="nut-ring-progress" cx="60" cy="60" r="51" pathLength="100" strokeDasharray={`${progress} 100`}/></svg>
            <div><strong>{amount(knownCalories)}</strong><small>{daily.kcal==null?'known kcal':'kcal logged'}</small></div>
          </div>
          <div className="nut-energy-detail"><h2>Daily energy</h2>
            {target?<>{daily.kcal!=null&&<p><strong>{amount(Math.abs(remaining??0))} kcal</strong> {(remaining??0)<0?'over target':'remaining'}</p>}
              <small>{amount(target.kcal)} kcal target</small></>:
              <button className="quiet" type="button" onClick={()=>changeTab('Targets')}>Set calorie target</button>}
            {daily.kcal==null&&<small>Some entries are missing calories. Only known values are included.</small>}
          </div>
        </section>
        <section className="panel nut-panel nut-macros"><h2>Macronutrients</h2>
          {macros.map(key=><div key={key} className="nut-macro" data-macro={key}>
            <div className="nut-between"><span>{labels[key]}</span><span>{amount(daily[key])} g{target&&` / ${amount(target[key])} g`}</span></div>
            <progress value={target?.[key]?daily[key]??0:0} max={target?.[key]||1} aria-label={labels[key]} style={{opacity:target?.[key]?1:0.35}}/>
          </div>)}
        </section>
      </div>
      <details className="panel disclosure nut-insights"><summary>Intake averages and diary coverage</summary><div className="nut-stats">{[7,30].map(length=>{
        const {mean,count}=period(length);
        return <div className="stat" key={length}><small>{length===7?'7-day average':'30-day average'}</small><strong>{mean==null?'—':amount(mean)+' kcal'}</strong><small>{count} confirmed {count===1?'day':'days'} with known calories</small></div>;
      })}
      <div className="stat"><small>Diary coverage</small><strong>{confirmed.has(day)?'Complete':'Incomplete'}</strong>
        <label className="nut-check"><input type="checkbox" checked={confirmed.has(day)} disabled={setup||busy}
          onChange={event=>void persist({type:'complete',day,complete:event.target.checked},event.target.checked?'Day marked complete.':'Day reopened.')}/> I logged everything for this date</label></div></div></details>
      <details className="panel nut-panel nut-daily-values"><summary>Daily nutrient totals</summary><NutrientValues values={daily}/></details>
      {!!recent.length&&!foodSearch&&!draft&&<section className="panel nut-panel"><h2>Recently logged</h2><div className="nut-controls">
        {recent.map(portion=><button key={JSON.stringify(portion.food)} className="quiet" disabled={busy} onClick={()=>pick(portion)}>{portion.food.name}</button>)}</div></section>}
    </>}
    {(foodSearch||draft||editingFood!==undefined)&&<section className="panel nut-panel nut-form nut-editor" tabIndex={-1} ref={editor} aria-label="Food editor">
      <div className="nut-between"><h2>{recipe?'Recipe ingredient':draft?.id?'Edit entry':draft?'Food details':'Find food'}</h2><button className="quiet" type="button" onClick={closeEditor}>Close</button></div>
      {editingFood!==undefined?<FoodEditor food={editingFood??undefined} onSave={correct} onCancel={()=>setEditingFood(undefined)}/>:draft?
        <form className="nut-form" onSubmit={submitPortion}>
          <h3>{draft.portion.food.name}</h3>
          <PortionEditor portion={draft.portion} onChange={portion=>setDraft({...draft,portion})}/>
          {!recipe&&mealSelect}
          <div className="nut-controls">
            <button className="button" disabled={busy||setup}>{recipe?'Use ingredient':draft.id?'Save changes':'Add to diary'}</button>
            {!recipe&&<button className="quiet" type="button" disabled={busy||setup||!(draft.portion.amount>0)} onClick={()=>void favorite()}>{draft.favoriteId?'Update favorite':'Save to favorites'}</button>}
            <button className="quiet" type="button" onClick={()=>setEditingFood(draft.portion.food)}>Correct label values</button>
          </div>
        </form>:<>
          <FoodSearch onPick={pick} disabled={setup} past={recentSearches} onSearch={search=>setRecentSearches(previous=>
            [search,...previous.filter(item=>item.query!==search.query||item.mode!==search.mode)].slice(0,5))}/>
          <button className="quiet" type="button" onClick={()=>setEditingFood(null)}>Create custom food</button>
          {library.some(item=>item.kind==='food')&&<div className="nut-controls"><small>Favorite foods</small>
            {library.filter(item=>item.kind==='food').map(item=><button key={item.id} className="quiet" onClick={()=>pick(item.portions[0],item.id)}>{item.name}</button>)}</div>}
          {recent.length>0&&<div className="nut-controls"><small>Recently logged</small>
            {recent.map(portion=><button key={JSON.stringify(portion.food)} className="quiet" onClick={()=>pick(portion)}>{portion.food.name}</button>)}</div>}
        </>}
    </section>}
    {tab==='Diary'&&<div className="nut-grid nut-meals">{meals.map(name=>{
      const items=current.filter(entry=>entry.meal===name);
      const totals=sumPortions(items.map(entry=>entry.portion));
      return <section className="panel nut-panel" key={name}>
        <div className="nut-between"><div className="nut-meal-title"><Utensils size={16}/><h2>{name}</h2><small>{amount(totals.kcal)} kcal</small></div>
          <button className="quiet" type="button" aria-label={`Add food to ${name}`} disabled={setup||busy} onClick={()=>openSearch(name)}><Plus size={16}/></button></div>
        {items.length?items.map(entry=><div className="nut-entry" key={entry.id}>
          <div><strong>{entry.portion.food.name}</strong><small>{amount(entry.portion.amount)} {entry.portion.unit==='serving'&&entry.portion.amount!==1?'servings':entry.portion.unit} · {entry.portion.food.preparation} · {entry.portion.food.source}</small></div>
          <span>{amount(portionValues(entry.portion).kcal)} kcal</span>
          <div className="nut-controls">
            <button className="quiet" type="button" disabled={busy} onClick={()=>{setMeal(entry.meal);setEditingFood(undefined);setDraft({id:entry.id,portion:entry.portion});showEditor();}}>Edit / move</button>
            <button className="quiet" type="button" disabled={busy} onClick={()=>void persist({type:'log',day,meal:entry.meal,portions:[entry.portion]},'Entry duplicated.')}>Duplicate</button>
            <button className="quiet" type="button" disabled={busy} onClick={()=>{if(window.confirm(`Delete ${entry.portion.food.name} from ${name}?`)) void persist({type:'delete',id:entry.id},'Entry deleted.');}}>Delete</button>
          </div>
        </div>):<p className="nut-empty">No foods logged.</p>}
        {items.length>0&&(saveMeal===name?<form className="nut-controls" onSubmit={async event=>{
          event.preventDefault();
          const fields=new FormData(event.currentTarget);
          if(await persist({type:'library',kind:'meal',name:fields.get('name'),portions:items.map(item=>item.portion),servings:1},'Meal saved.')) setSaveMeal(undefined);
        }}><input aria-label="Saved meal name" defaultValue={name} name="name" required maxLength={160}/><button className="button" disabled={busy}>Save</button>
          <button className="quiet" type="button" onClick={()=>setSaveMeal(undefined)}>Cancel</button></form>:
          <button className="quiet" type="button" disabled={busy} onClick={()=>setSaveMeal(name)}>Save meal</button>)}
      </section>;
    })}</div>}
    {tab==='Trends'&&<NutritionCharts day={day} intake={intake} targets={targets} weights={weights} strength={strength}/>}
    {tab==='Targets'&&<NutritionTargets key={day} day={day} target={target} weight={latestWeight} adaptation={adaptiveMaintenance(day,entries,complete,weights)} busy={busy||setup} onSave={values=>void persist({type:'targets',day,targets:values},'Daily targets saved.')}/>}
    {tab==='Favorites & recipes'&&<>
      <section className="panel nut-panel nut-form">
        <div className="nut-between"><h2>Favorites and saved meals</h2><button className="button" disabled={busy||setup} onClick={()=>{closeEditor();setRecipe({name:'',servings:1,portions:[]});}}><Plus size={16}/> New recipe</button></div>
        {mealSelect}
        {!library.length&&<p className="nut-empty">Save a food or meal from the diary, or build a recipe here.</p>}
        {library.map(item=><div className="nut-entry" key={item.id}>
          <div><strong>{item.name}</strong><small>{item.kind} · {item.portions.length} {item.portions.length===1?'item':'items'}{item.kind==='recipe'&&` · ${item.servings} servings`}</small></div>
          <span>{amount(sumPortions(item.portions,item.servings).kcal)} kcal{item.kind==='recipe'&&' / serving'}</span>
          <div className="nut-controls">
            <button className="button" disabled={busy} onClick={()=>void persist({type:'log',day,meal,portions:item.portions.map(portion=>({...portion,amount:portion.amount/item.servings}))},`${item.name} logged to ${meal}.`)}>Log {item.kind==='recipe'?'1 serving':'again'}</button>
            {item.kind==='food'&&<button className="quiet" onClick={()=>openFavorite(item)}>Details</button>}
            {item.kind==='recipe'&&<button className="quiet" onClick={()=>{closeEditor();setRecipe(item);}}>Edit recipe</button>}
            <button className="quiet" disabled={busy} onClick={()=>{if(window.confirm(`Remove ${item.name} from favorites?`)) void persist({type:'remove',id:item.id},'Item removed.');}}>Remove</button>
          </div>
        </div>)}
      </section>
      {recipe&&<form className="panel nut-panel nut-form" onSubmit={async event=>{
        event.preventDefault();
        if(await persist({type:'library',kind:'recipe',...recipe},'Recipe saved.')){setRecipe(undefined);closeEditor();}
      }}>
        <h2>Recipe builder</h2>
        <div className="nut-form-grid">
          <label className="nut-field">Recipe name<input required maxLength={160} value={recipe.name} onChange={event=>setRecipe({...recipe,name:event.target.value})}/></label>
          <label className="nut-field">Servings<input required type="number" min="1" max="1000" value={recipe.servings||''} onChange={event=>setRecipe({...recipe,servings:Number(event.target.value)})}/></label>
        </div>
        {recipe.portions.map((portion,index)=><div key={index} className="nut-between">
          <span>{portion.food.name} · {amount(portion.amount)} {portion.unit}</span><div className="nut-controls">
            <button className="quiet" type="button" onClick={()=>{setRecipeIndex(index);pick(portion);}}>Edit quantity</button>
            <button className="quiet" type="button" onClick={()=>{closeEditor();setRecipe({...recipe,portions:recipe.portions.filter((_,i)=>i!==index)});}}>Remove</button>
          </div></div>)}
        <div className="nut-grid"><div><h3>Recipe total</h3><NutrientValues values={sumPortions(recipe.portions)}/></div>
          <div><h3>Per serving</h3><NutrientValues values={recipe.servings>0?sumPortions(recipe.portions,recipe.servings):{}}/></div></div>
        <div className="nut-controls">
          <button className="quiet" type="button" disabled={recipe.portions.length>=60} onClick={()=>{closeEditor();setFoodSearch(true);showEditor();}}>Add ingredient</button>
          <button className="button" disabled={!recipe.portions.length||draft!==undefined||busy}>Save recipe</button>
          <button className="quiet" type="button" onClick={()=>{setRecipe(undefined);closeEditor();}}>Cancel</button>
        </div>
      </form>}
    </>}
  </div>;
}
