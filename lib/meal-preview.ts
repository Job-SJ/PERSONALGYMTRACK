import {meals,sumPortions,unitsFor,type Food,type Meal,type Portion} from './nutrition';

type Unit=Portion['unit'];
export type MealLine={query:string;amount:number|null;unit:Unit|null};
export type MatchedLine=MealLine&{foods:Food[];selected:number|null;unavailable?:boolean};
export type MealPreview={meal:Meal|null;lines:MatchedLine[]};
export type ConfirmMeal={type:'confirm-meal';requestId:string;day:string;meal:Meal;portions:Portion[]};
export const maxMealText=420;
export const maxMealItems=6;
export const isMealLogMessage=(text:string)=>/^(?:(?:please\s+)?(?:log|add|registreer)\s+(?:(?:my\s+|mijn\s+)?(?:breakfast|ontbijt|lunch|dinner|avondeten|snacks?|tussendoortje)\s*:|\d)|(?:i (?:ate|had)|ik (?:at|had))\s+\d)/i.test(text.trim());

const mealWords:Record<string,Meal>={breakfast:'Breakfast',ontbijt:'Breakfast',lunch:'Lunch',dinner:'Dinner',avondeten:'Dinner',
  snack:'Snacks',snacks:'Snacks',tussendoortje:'Snacks'};
const servings='servings?|portions?|porties?|stuks?|pieces?';
const measure=new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(kg|ml|g|l|${servings})?\\s+(?:of\\s+|van\\s+)?(.+)$`,'i');

export function parseMealText(input:string){
  const text=typeof input==='string'?input.trim():'';
  if(!text||text.length>maxMealText) throw new Error('Describe a meal in up to 420 characters.');
  let meal:Meal|null=null;
  const cleaned=text.replace(/^(?:please\s+)?(?:(?:log|add|registreer|logboek)\s+(?:(?:my|mijn)\s+)?|(?:i (?:ate|had)|ik (?:at|had))\s+)/i,'')
    .replace(/^(?:for |voor )?(breakfast|ontbijt|lunch|dinner|avondeten|snacks?|tussendoortje)\s*(?::|,|\s)\s*/i,
      (_,name:string)=>{meal=mealWords[name.toLowerCase()];return '';})
    .replace(/\s+(?:for|voor)\s+(breakfast|ontbijt|lunch|dinner|avondeten|snacks?|tussendoortje)[.!]?$/i,
      (_,name:string)=>{meal=mealWords[name.toLowerCase()];return '';});
  const lines=cleaned.split(/\n|;|(?<!\d),|,(?!\d)|\s+(?:and|en|\+)\s+(?=\d)/i).map(part=>part.trim()).filter(Boolean).map(part=>{
    const match=/^\d{4,24}$/.test(part)?null:measure.exec(part);
    if(!match) return {query:part.replace(/[.!?]+$/,''),amount:null,unit:null};
    const [,number,word,item]=match;
    const unit=word?.toLowerCase();
    const amount=Number(number.replace(',','.'))*(unit==='kg'||unit==='l'?1000:1);
    return {query:item.replace(/[.!?]+$/,''),amount,unit:(unit==='kg'||unit==='g'?'g':unit==='l'||unit==='ml'?'ml':'serving') as Unit};
  });
  if(!lines.length||lines.length>maxMealItems||lines.some(line=>line.query.length<2||line.query.length>80)){
    throw new Error('Enter up to six food names or barcodes, separated by commas or new lines.');
  }
  return {meal,lines};
}

const normalized=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function matchMealLine(line:MealLine,foods:Food[],unavailable=false):MatchedLine{
  const unique=foods.filter((food,index)=>foods.findIndex(candidate=>food.code?candidate.code===food.code:
    !candidate.code&&candidate.name===food.name&&candidate.brand===food.brand&&candidate.basis===food.basis)===index);
  const query=normalized(line.query);
  const exact=(food:Food)=>food.code===line.query||[food.name,...(food.brand?[food.brand+' '+food.name,food.name+' '+food.brand]:[])]
    .some(value=>normalized(value)===query);
  const compatible=unique.filter(food=>exact(food)&&(!line.unit||unitsFor(food).includes(line.unit)));
  const choices=[...unique].sort((a,b)=>Number(exact(b))-Number(exact(a))).slice(0,5);
  const selected=compatible.length===1?choices.indexOf(compatible[0]):-1;
  return {...line,foods:choices,selected:selected<0?null:selected,unavailable};
}

export const defaultMeal:Meal=meals[1];

export function customMealFood(line:MealLine):Food{
  return {name:line.query,source:'Custom label',preparation:'As sold',basis:line.unit??'serving',values:{}};
}

export function mealPreviewTotals(portions:Portion[]){
  const {kcal,protein,carbs,fat}=sumPortions(portions);
  return [kcal==null?'Calories unavailable':`Estimated ${Math.round(kcal)} kcal`,
    protein==null?null:`Protein ${Math.round(protein)} g`,carbs==null?null:`Carbs ${Math.round(carbs)} g`,
    fat==null?null:`Fat ${Math.round(fat)} g`].filter(Boolean).join(' · ');
}
