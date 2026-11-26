import {foodSchema,nutrients,type Food,type Values} from './nutrition';

const fields='code,product_name,product_name_nl,brands,image_front_small_url,nutrition,nutrition_data_per,serving_size';
const mapping={kcal:'energy-kcal',protein:'proteins',carbs:'carbohydrates',fat:'fat',fiber:'fiber',sugar:'sugars',salt:'salt',sodium:'sodium'};
const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const string=(value:unknown)=>typeof value==='string'?value.trim():'';
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{};

export function fromOpenFoodFacts(input:unknown):Food|null {
  if(!input||typeof input!=='object') return null;
  const p=input as Record<string,unknown>;
  const name=(string(p.product_name_nl)||string(p.product_name)).slice(0,160);
  const code=string(p.code);
  const inputSets=object(p.nutrition).input_sets;
  const sets=(Array.isArray(inputSets)?inputSets:[]).map(object)
    .filter(set=>set.preparation==='as_sold'&&['manufacturer','packaging'].includes(string(set.source)));
  const base=sets.find(set=>set.per===p.nutrition_data_per)??sets.find(set=>['100g','100ml'].includes(string(set.per)))??sets.find(set=>set.per==='serving');
  const basis=base?.per==='serving'?'serving':base?.per==='100ml'?'ml':'g';
  const data=object(base?.nutrients);
  function read(key:string,unit:string){
    const value=object(data[key]);
    if(value.modifier==='<'||value.modifier==='>') return null;
    if(value.unit===unit) return number(value.value);
    if(unit==='g'&&value.unit==='mg'){const measured=number(value.value);return measured==null?null:measured/1000;}
    return null;
  }
  const energy=read('energy-kj','kJ');
  const values:Values=Object.fromEntries(nutrients.map(key=>[key,read(mapping[key],key==='kcal'?'kcal':'g')??(key==='kcal'&&energy!=null?energy/4.184:null)]));
  const servingMatch=string(p.serving_size).match(/(?:^|\()(\d+(?:[.,]\d+)?)\s*(g|ml)\)?$/i);
  const servingSet=sets.find(set=>set.per==='serving'&&['g','ml'].includes(string(set.per_unit)));
  const serving=servingMatch?{amount:Number(servingMatch[1].replace(',','.')),unit:servingMatch[2].toLowerCase()}:
    servingSet?{amount:number(servingSet.per_quantity)??0,unit:string(servingSet.per_unit)}:undefined;
  const image=string(p.image_front_small_url);
  const result=foodSchema.safeParse({
    name,code:code||undefined,brand:(Array.isArray(p.brands)?p.brands.map(brand=>string(brand).replace(/^\w\w:/,'')).join(', '):string(p.brands)).slice(0,160),
    image:image.startsWith('https://images.openfoodfacts.org/')?image:undefined,
    source:'Open Food Facts',preparation:'As sold',basis,values,
    serving:serving&&serving.amount>0&&serving.amount<=10000?serving:undefined,
  });
  return result.success?result.data:null;
}

export type SearchMode='name'|'brand'|'barcode';

export function foodSearchUrl(mode:SearchMode,query:string){
  if(mode==='barcode') return new URL('https://world.openfoodfacts.org/api/v3.6/product/'+encodeURIComponent(query)+'.json?'+new URLSearchParams({fields}));
  const url=new URL(mode==='brand'?'https://nl.openfoodfacts.org/api/v2/search':'https://search.openfoodfacts.org/search');
  url.search=new URLSearchParams({
    ...(mode==='brand'?{brands_tags:query.toLowerCase().replace(/\s+/g,'-'),fields}:{q:query,langs:'nl,en'}),
    page_size:'16',
  }).toString();
  return url;
}

export function dutchMarketFirst(products:unknown[]){
  const dutch=(product:unknown)=>{
    const countries=object(product).countries;
    return Array.isArray(countries)&&countries.includes('en:netherlands')?1:0;
  };
  return [...products].sort((left,right)=>dutch(right)-dutch(left));
}
