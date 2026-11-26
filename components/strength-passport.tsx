'use client';

import {useState} from 'react';
import {Download} from 'lucide-react';
import {passportContents,passportDefaults,passportDimensions,passportLimit,passportPng,safePassportText,type PassportFact} from '../lib/passport';

export function StrengthPassport({facts,initialDark}:{facts:PassportFact[];initialDark:boolean}){
  const [name,setName]=useState('');
  const [selected,setSelected]=useState(()=>passportDefaults(facts));
  const [dark,setDark]=useState(initialDark);
  const [review,setReview]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const contents=passportContents(facts,selected,name);
  const invalidName=Boolean(name.trim()&&!safePassportText(name));
  function toggle(key:string,checked:boolean){
    setSelected(current=>checked?[...current,key].slice(0,passportLimit):current.filter(value=>value!==key));
    setReview(false);
  }
  async function download(){
    if(!review||busy||invalidName||!contents.facts.length) return;
    setBusy(true);
    setMessage('');
    try{
      const blob=await passportPng(contents,dark);
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download='personalgymtrack-strength-passport.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),10_000);
      setReview(false);
      setMessage('Passport PNG downloaded.');
    }catch{setMessage('The image could not be generated. Try again in a browser that supports canvas export.');}
    finally{setBusy(false);}
  }

  return <div className="passport-layout">
    <section className="passport-card" data-dark={dark} aria-label="Private passport preview">
      <p className="passport-wordmark">PERSONALGYMTRACK</p>
      <h2>Strength Passport</h2>
      <p className="passport-name">{contents.name}</p>
      <dl>{contents.facts.map(({label,value})=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="passport-signature">Your strength. Your story.</p>
    </section>
    <div className="passport-options">
      <div>
        <h2>Customize your card</h2>
        <p className="muted">Choose up to four facts. Your preview stays private.</p>
      </div>
      <label className="passport-name-input">Display name <input value={name} placeholder="Athlete" maxLength={52}
        aria-invalid={invalidName||undefined} onChange={event=>{setName(event.target.value);setReview(false);}}/></label>
      {invalidName&&<p role="alert" className="muted">Use a display name without contact or account details.</p>}
      <fieldset className="passport-fields">
        <legend>Facts to include</legend>
        {facts.map(fact=><label key={fact.key}><input type="checkbox" checked={selected.includes(fact.key)}
          disabled={busy||(!selected.includes(fact.key)&&selected.length>=passportLimit)}
          onChange={event=>toggle(fact.key,event.target.checked)}/>{fact.label}</label>)}
      </fieldset>
      <label className="passport-option"><input type="checkbox" checked={dark} onChange={event=>{setDark(event.target.checked);setReview(false);}}/> Dark passport</label>
      {review?<div className="passport-review">
        <p>Download <strong>{contents.name}</strong> with {contents.facts.map(fact=>fact.label.toLowerCase()).join(', ')}.</p>
        <div className="inline"><button className="button" type="button" disabled={busy} onClick={()=>void download()}><Download size={16}/> {busy?'Creating PNG…':'Download selected fields'}</button>
          <button className="quiet" type="button" disabled={busy} onClick={()=>setReview(false)}>Cancel</button></div>
      </div>:<button className="button" type="button" disabled={invalidName||!contents.facts.length} onClick={()=>{setReview(true);setMessage('');}}>Review PNG export</button>}
      <small>{passportDimensions.width} × {passportDimensions.height} PNG generated on this device.</small>
      {message&&<p className="muted" role="status">{message}</p>}
    </div>
  </div>;
}
