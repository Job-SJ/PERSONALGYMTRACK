'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Barcode,ScanLine,Search,X} from 'lucide-react';
import {searchFoods} from '../app/nutrition-actions';
import {foodSchema,labels,nutrients,portionValues,unitsFor,type Food,type Portion,type Values} from '../lib/nutrition';
import type {SearchMode} from '../lib/open-food-facts';
import {amount} from './nutrition-charts';

export function NutrientValues({values}:{values:Values}){
  return <dl className="nut-values">{nutrients.map(key=><div key={key}><dt>{labels[key]}</dt>
    <dd>{key==='sodium'&&values.sodium!=null?`${amount(values.sodium*1000)} mg`:key==='salt'&&values.salt!=null?
      `${new Intl.NumberFormat('en',{maximumFractionDigits:3}).format(values.salt)} g`:
      <>{amount(values[key])}{values[key]!=null&&(key==='kcal'?' kcal':' g')}</>}</dd></div>)}</dl>;
}

export const basisLabel=(basis:Food['basis'])=>basis==='serving'?'per serving':`per 100 ${basis}`;

export function FoodEditor({food,onSave,onCancel}:{food?:Food;onSave:(food:Food)=>void;onCancel:()=>void}){
  const [basis,setBasis]=useState<Food['basis']>(food?.basis??'g');
  const [error,setError]=useState('');
  const [energyUnit,setEnergyUnit]=useState('kcal');
  const [energy,setEnergy]=useState(String(food?.values.kcal??''));
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const values=Object.fromEntries(nutrients.map(key=>{
      const raw=fields.get(key);
      return [key,raw===''?null:Number(raw)/(key==='kcal'&&energyUnit==='kJ'?4.184:1)];
    }));
    const serving=Number(fields.get('serving'));
    const parsed=foodSchema.safeParse({
      ...food,name:fields.get('name'),preparation:fields.get('preparation'),basis,values,
      source:food?.code?'Corrected label':'Custom label',serving:serving?{amount:serving,unit:fields.get('servingUnit')}:undefined,
    });
    if(parsed.success){onSave(parsed.data);return;}
    setError(parsed.error.issues[0]?.message??'Review the label values.');
  }
  return <form className="nut-form" onSubmit={submit}>
    <h3>{food?'Correct label values':'Create custom food'}</h3>
    <label className="nut-field">Food name<input name="name" maxLength={160} required defaultValue={food?.name}/></label>
    <div className="nut-form-grid">
      <label className="nut-field">Preparation<select name="preparation" defaultValue={food?.preparation??'As sold'}><option>As sold</option><option>Raw</option><option>Cooked</option></select></label>
      <label className="nut-field">Nutrition basis<select value={basis} onChange={e=>{setBasis(e.target.value as Food['basis']);setEnergy('');}}>
        <option value="g">Per 100 g</option><option value="ml">Per 100 ml</option><option value="serving">Per serving</option>
      </select></label>
      <label className="nut-field">Serving size from label <input type="number" name="serving" step="any" min=".001" max="10000" defaultValue={food?.serving?.amount}/></label>
      <label className="nut-field">Serving unit<select name="servingUnit" defaultValue={food?.serving?.unit??'g'}><option value="g">g</option><option value="ml">ml</option></select></label>
      <label className="nut-field">Energy unit<select value={energyUnit} onChange={e=>{
        if(energy!=='') setEnergy(String(Number(energy)*(e.target.value==='kJ'?4.184:1/4.184)));
        setEnergyUnit(e.target.value);
      }}><option>kcal</option><option>kJ</option></select></label>
    </div>
    <p className="muted nut-caption">Enter values from the label {basisLabel(basis)}. Leave unknown values blank.</p>
    <div key={basis} className="nut-form-grid">{nutrients.map(key=><label className="nut-field" key={key}>{labels[key]} ({key==='kcal'?energyUnit:'g'})
      {key==='kcal'?<input type="number" name={key} min="0" step="any" value={energy} onChange={event=>setEnergy(event.target.value)}/>:
        <input type="number" name={key} min="0" step="any" defaultValue={food?.basis===basis?food.values[key]??undefined:undefined}/>}</label>)}</div>
    {error&&<p role="alert">{error}</p>}
    <div className="nut-controls"><button className="button" type="submit">Use these values</button><button className="quiet" type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}

function Scanner({onFound,onClose}:{onFound:(code:string)=>void;onClose:()=>void}){
  const video=useRef<HTMLVideoElement>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let alive=true;
    let stream:MediaStream|undefined;
    let scanning:{stop:()=>void}|undefined;
    const stop=()=>stream?.getTracks().forEach(track=>track.stop());
    async function start(){
      if(!navigator.mediaDevices?.getUserMedia){setError('Camera scanning requires a secure connection. Enter the barcode manually below.');return;}
      try{
        const {BrowserMultiFormatOneDReader}=await import('@zxing/browser');
        if(!alive) return;
        stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
        if(!alive||!video.current){stop();return;}
        const reader=new BrowserMultiFormatOneDReader();
        scanning=await reader.decodeFromStream(stream,video.current,(result,_error,controls)=>{
          const code=result?.getText();
          if(!alive||!code||!/^\d{4,24}$/.test(code)) return;
          alive=false;controls.stop();stop();onFound(code);
        });
        if(!alive) scanning.stop();
      }catch{stop();if(alive)setError('Camera permission or access is unavailable. Enter the barcode manually below.');}
    }
    void start();
    return ()=>{alive=false;scanning?.stop();stop();};
  },[onFound]);
  return <section className="nut-scanner"><div className="nut-between"><h3>Scan barcode</h3><button type="button" className="quiet" aria-label="Close scanner" onClick={onClose}><X size={16}/></button></div>
    {error?<p role="status" className="muted">{error}</p>:<video ref={video} autoPlay muted playsInline aria-label="Barcode camera preview"/>}</section>;
}

export type RecentSearch={mode:SearchMode;query:string};

export function FoodSearch({onPick,disabled,past,onSearch}:{onPick:(portion:Portion)=>void;disabled?:boolean;past:RecentSearch[];onSearch:(search:RecentSearch)=>void}){
  const [mode,setMode]=useState<SearchMode>('name');
  const [query,setQuery]=useState('');
  const [results,setResults]=useState<Food[]>([]);
  const [pending,setPending]=useState(false);
  const [scanning,setScanning]=useState(false);
  const [message,setMessage]=useState('');
  const scanned=useRef<(code:string)=>void>(()=>{});
  async function run(nextMode:SearchMode,nextQuery:string,pick=false,fallback?:Food){
    if(disabled) return;
    setPending(true);setMessage('');
    if(!pick) setResults([]);
    try{
      const result=await searchFoods(nextMode,nextQuery);
      if(result.error){if(pick&&fallback) select(fallback);else setMessage(result.error);return;}
      const foods=result.foods??[];
      if(pick){
        if(foods[0]||fallback) select(foods[0]??fallback!);
        else setMessage('Product details are unavailable.');
        return;
      }
      setResults(foods);
      if(!foods.length) setMessage('No matching products.');
      onSearch({mode:nextMode,query:nextQuery.trim()});
    }catch{setMessage('Search failed. Please try again.');}
    finally{setPending(false);}
  }
  function select(food:Food){onPick({food,amount:food.basis==='serving'?1:100,unit:food.basis});}
  useEffect(()=>{
    scanned.current=code=>{setMode('barcode');setQuery(code);setScanning(false);void run('barcode',code);};
  });
  const [onFound]=useState(()=>(code:string)=>scanned.current(code));
  return <div className="nut-form">
    {scanning&&<Scanner onFound={onFound} onClose={()=>setScanning(false)}/>}
    <form className="nut-search" onSubmit={event=>{event.preventDefault();void run(mode,query);}}>
      <label><span className="nut-visually-hidden">Search by</span><select value={mode} onChange={e=>{setMode(e.target.value as SearchMode);setQuery('');}}>
        <option value="name">Product</option><option value="brand">Brand</option><option value="barcode">Barcode</option>
      </select></label>
      <label className="nut-search-input"><span className="nut-visually-hidden">{mode==='barcode'?'Barcode':'Search terms'}</span><input required minLength={2} maxLength={80}
        value={query} inputMode={mode==='barcode'?'numeric':'search'} placeholder={mode==='barcode'?'Enter barcode':'Search Open Food Facts'} onChange={e=>setQuery(e.target.value)}/></label>
      <button className="button" disabled={pending||disabled}><Search size={16}/> Search</button>
      <button type="button" className="quiet" disabled={pending||disabled} onClick={()=>{setMode('barcode');setScanning(true);}}><ScanLine size={16}/> Scan</button>
    </form>
    {past.length>0&&<div className="nut-controls"><small>Recent searches</small>{past.map(item=><button className="quiet" type="button" disabled={pending||disabled}
      key={item.mode+item.query} onClick={()=>{setMode(item.mode);setQuery(item.query);void run(item.mode,item.query);}}>{item.query}</button>)}</div>}
    {(pending||message)&&<p role="status" className="muted">{pending?'Searching Open Food Facts…':message}</p>}
    <div className="nut-results">{results.map((food,i)=><button type="button" className="quiet nut-result" key={(food.code??food.name)+i} disabled={pending} onClick={()=>{
      if(food.code&&mode!=='barcode'&&!nutrients.some(key=>food.values[key]!=null)) void run('barcode',food.code,true,food);
      else select(food);
    }}>
      {food.image?
        // eslint-disable-next-line @next/next/no-img-element
        <img src={food.image} alt="" loading="lazy" referrerPolicy="no-referrer"/>:<Barcode size={21}/>}
      <span><strong>{food.name}</strong><small>{food.brand||food.code||food.source}</small></span>
      <span className="nut-result-energy">{food.values.kcal==null?'View label':`${amount(food.values.kcal)} kcal`}</span>
    </button>)}</div>
    <small>Product data and images from <a className="nut-link" href="https://world.openfoodfacts.org/">Open Food Facts</a>.</small>
  </div>;
}

export function PortionEditor({portion,onChange}:{portion:Portion;onChange:(portion:Portion)=>void}){
  const {food}=portion;
  const supported=unitsFor(food);
  return <>
    <p className="muted nut-caption">{food.code?<a className="nut-link" href={`https://world.openfoodfacts.org/product/${food.code}`}>{food.source}</a>:food.source} · {food.preparation} · {basisLabel(food.basis)}
      {food.serving&&` · 1 serving = ${food.serving.amount} ${food.serving.unit}`}</p>
    <div className="nut-form-grid">
      <label className="nut-field">Quantity<input value={portion.amount||''} type="number" min=".001" max="100000" step="any" required onChange={event=>onChange({...portion,amount:Number(event.target.value)})}/></label>
      <label className="nut-field">Unit<select aria-label="Unit" value={portion.unit} onChange={event=>{
        const unit=event.target.value as Portion['unit'];
        const serving=food.serving?.amount??1;
        const quantity=unit===portion.unit?portion.amount:unit==='serving'?portion.amount/serving:portion.amount*serving;
        onChange({...portion,unit,amount:Number(quantity.toPrecision(12))});
      }}>
        {supported.map(unit=><option key={unit}>{unit}</option>)}
      </select></label>
    </div>
    <NutrientValues values={portion.amount>0?portionValues(portion):{}}/>
  </>;
}
