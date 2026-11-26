export type PassportFact={key:string;label:string;value:string};

export function safePassportText(value:string){
  const cleaned=value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim();
  return /@|https?:|\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b|[\w-]{24,}|\b(?:bearer|api[_ -]?key|token|secret|password)\b/i.test(cleaned)?'':cleaned.slice(0,52);
}

const defaultKeys=['estimate','progress','workouts','history'];
export const passportLimit=4;
export const passportDimensions={width:1200,height:1500};

export function passportDefaults(facts:PassportFact[]){
  const preferred=defaultKeys.filter(key=>facts.some(fact=>fact.key===key));
  const fallback=facts.filter(fact=>['recorded','time','muscle','exercise','milestone'].includes(fact.key)).map(fact=>fact.key);
  return [...preferred,...fallback].slice(0,passportLimit);
}

export function passportContents(facts:PassportFact[],selected:string[],name:string){
  const chosen=selected.slice(0,passportLimit).flatMap(key=>{
    const fact=facts.find(item=>item.key===key);
    if(!fact) return [];
    const label=safePassportText(fact.label), value=safePassportText(fact.value);
    return label&&value?[{label,value}]:[];
  });
  return {name:safePassportText(name)||'Athlete',facts:chosen};
}

export async function passportPng(contents:ReturnType<typeof passportContents>,dark:boolean){
  const canvas=document.createElement('canvas');
  const {width,height}=passportDimensions;
  canvas.width=width;
  canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(!ctx) throw new Error('Image export is unavailable');
  const ink=dark?'#f1f5f8':'#18242d', secondary=dark?'#a5b3bf':'#4d616d';
  const line=dark?'#2a3541':'#d3dde4', accent=dark?'#b9ed7f':'#38651d';
  ctx.fillStyle=dark?'#141a21':'#f8fafb';
  ctx.fillRect(0,0,width,height);
  const left=92, contentWidth=width-2*left;
  const type=(text:string,y:number,size:number,weight:number,color:string)=>{
    ctx.font=weight+' '+size+'px system-ui, sans-serif';
    ctx.fillStyle=color;
    ctx.fillText(text,left,y,contentWidth);
  };
  const rule=(y:number)=>{
    ctx.fillStyle=line;
    ctx.fillRect(left,y,contentWidth,2);
  };
  ctx.fillStyle=accent;
  ctx.fillRect(left,88,78,8);
  type('PERSONALGYMTRACK',152,34,750,accent);
  type('Strength Passport',237,58,750,ink);
  type(contents.name,340,76,750,ink);
  rule(404);
  contents.facts.forEach(({label,value},index)=>{
    const y=495+index*207;
    type(label,y,34,500,secondary);
    type(value,y+81,66,750,ink);
    rule(y+128);
  });
  type('Your strength. Your story.',1401,36,600,ink);
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>{
    if(blob) resolve(blob);
    else reject(new Error('Image export is unavailable'));
  },'image/png'));
}
