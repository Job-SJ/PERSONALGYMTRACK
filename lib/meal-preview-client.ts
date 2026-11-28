import {useRef,useState} from 'react';
import {customMealFood,defaultMeal,type ConfirmMeal,type MatchedLine,type MealPreview} from './meal-preview';
import {portionSchema,unitsFor,type Food,type Meal,type Portion} from './nutrition';

type Row={line:MatchedLine;food?:Food;amount:string;unit:Portion['unit']};
function choose(row:Row,food:Food):Row {
  const unit=unitsFor(food).includes(row.unit)?row.unit:food.basis;
  return {...row,food,unit,amount:unit===row.unit&&row.amount?row.amount:''};
}
type Options={
  day:string;meal?:Meal;randomId:()=>string;initialText?:string;
  preview:(input:string)=>Promise<MealPreview>;
  save:(input:ConfirmMeal)=>Promise<void>;
};
export function useMealPreview({day,meal:initialMeal=defaultMeal,randomId,preview,save,initialText=''}:Options){
  const [text,setText]=useState(initialText);
  const [meal,setMeal]=useState(initialMeal);
  const [rows,setRows]=useState<Row[]>([]);
  const [state,setState]=useState<'preview'|'save'>();
  const [message,setMessage]=useState('');
  const active=useRef(false);
  const pending=useRef<ConfirmMeal|null>(null);
  const [retry,setRetry]=useState(false);
  const portions=rows.map(row=>portionSchema.safeParse({food:row.food,amount:Number(row.amount.replace(',','.')),unit:row.unit}));
  const canConfirm=rows.length>0&&portions.every(portion=>portion.success);
  async function run(kind:'preview'|'save',fn:()=>Promise<void>){
    if(active.current) return;
    active.current=true;setState(kind);setMessage('');
    try{await fn();}
    catch(error){setMessage(error instanceof Error?error.message:'Try again.');}
    finally{active.current=false;setState(undefined);}
  }
  function start(){
    if(!text.trim()||pending.current) return;
    void run('preview',async()=>{
      const next=await preview(text);
      setMeal(next.meal??initialMeal);
      setRows(next.lines.map(line=>{
        const row:Row={line,amount:line.amount===null?'':String(line.amount),unit:line.unit??'serving'};
        return line.selected===null?row:choose(row,line.foods[line.selected]);
      }));
    });
  }
  function confirm(){
    if(!canConfirm&&!pending.current) return;
    void run('save',async()=>{
      const command=pending.current??{type:'confirm-meal',requestId:randomId(),day,meal,
        portions:portions.flatMap(portion=>portion.success?[portion.data]:[])};
      pending.current=command;
      setRetry(true);
      await save(command);
      pending.current=null;
      setRetry(false);setRows([]);setText('');setMessage('Meal logged.');
    });
  }
  function edit(index:number,change:(row:Row)=>Row){
    if(active.current||pending.current) return;
    setRows(current=>current.map((row,i)=>i===index?change(row):row));
  }
  return {text,setText:(value:string)=>{setText(value);setRows([]);setMessage('');},meal,setMeal,rows,portions:portions.flatMap(portion=>portion.success?[portion.data]:[]),
    state,message,retry,canConfirm,start,confirm,
    editAmount:(index:number,amount:string)=>edit(index,row=>({...row,amount})),
    editUnit:(index:number,unit:Portion['unit'])=>edit(index,row=>({...row,unit})),
    pick:(index:number,food:Food)=>edit(index,row=>choose(row,food)),
    custom:(index:number)=>edit(index,row=>choose(row,customMealFood(row.line))),
    remove:(index:number)=>{if(!active.current&&!pending.current)setRows(current=>current.filter((_,i)=>i!==index));},
  };
}
