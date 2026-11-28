'use client';

import {useEffect,useRef,useState} from 'react';
import {Copy,Check} from 'lucide-react';
import {chatSuggestions,type ChatCommand} from '../lib/coach-chat';
import {useCoachChat} from '../lib/coach-chat-client';
import {coachMarkdown} from '../lib/coach-markdown';

const transport=(command:ChatCommand,signal:AbortSignal)=>fetch('/api/coach',{signal,cache:'no-store',
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});

export function CoachMarkdown({text}:{text:string}){
  return <div className="coach-markdown">{coachMarkdown(text).map(({kind,parts},index)=>
    <div key={index} className={'coach-md-'+kind}>{parts.map((part,i)=>part.style==='strong'?<strong key={i}>{part.text}</strong>:
      part.style==='emphasis'?<em key={i}>{part.text}</em>:part.style==='code'?<code key={i}>{part.text}</code>:part.text)}</div>)}</div>;
}

export function CoachChat({blocked}:{blocked:boolean}){
  const [draft,setDraft]=useState('');
  const [rename,setRename]=useState<string>();
  const [confirm,setConfirm]=useState(false);
  const [copied,setCopied]=useState<string>();
  const log=useRef<HTMLDivElement>(null);
  const composer=useRef<HTMLTextAreaElement>(null);
  const chat=useCoachChat(transport,()=>crypto.randomUUID(),true);
  useEffect(()=>{if(log.current) log.current.scrollTop=log.current.scrollHeight;},[chat.turns,chat.partial,chat.generating]);
  useEffect(()=>{
    const input=composer.current;
    if(!input) return;
    input.style.height='auto';
    input.style.height=Math.min(input.scrollHeight+2,140)+'px';
  },[draft]);
  const disabled=chat.busy||blocked;
  const reset=()=>{setDraft('');setRename(undefined);setConfirm(false);};
  return <section className="coach-chat" aria-label="Coach chat">
    <div>
    <div className="coach-chat-toolbar">
      <button className="quiet" disabled={disabled} onClick={()=>{chat.newChat();reset();}}>New chat</button>
      <select aria-label="Conversations" value={chat.conversation?.id??''} disabled={disabled||chat.loading}
        onChange={event=>{if(event.target.value) chat.select(event.target.value);else chat.newChat();reset();}}>
        <option value="">New conversation</option>
        {chat.conversations.map(row=><option key={row.id} value={row.id}>{row.title==='New chat'?new Date(row.updated_at).toLocaleString():row.title}</option>)}
      </select>
      {chat.conversation&&<><button className="quiet" disabled={disabled} onClick={()=>setRename(chat.conversation?.title)}>Rename</button>
        <button className="quiet" disabled={disabled} onClick={()=>setConfirm(!confirm)}>Delete</button></>}
    </div>
    {rename!==undefined&&<form className="inline" onSubmit={event=>{event.preventDefault();chat.rename(rename,()=>setRename(undefined));}}>
      <input aria-label="Conversation title" maxLength={80} value={rename} onChange={event=>setRename(event.target.value)} required/>
      <button className="button" disabled={disabled}>Save</button><button type="button" className="quiet" onClick={()=>setRename(undefined)}>Cancel</button>
    </form>}
    {confirm&&<div className="inline"><span>Delete this conversation?</span><button className="quiet" disabled={disabled}
      onClick={()=>{chat.remove();setConfirm(false);}}>Confirm deletion</button><button className="quiet" onClick={()=>setConfirm(false)}>Cancel</button></div>}
    </div>
    <div className="coach-log" ref={log} aria-label="Messages" tabIndex={0}>
      {!chat.turns.length&&<div className="coach-welcome"><h2>What would you like to work on?</h2>
        <div className="coach-questions">{chatSuggestions().map(question=><button key={question} className="quiet" disabled={disabled}
          onClick={()=>{setDraft(question);composer.current?.focus();}}>{question}</button>)}</div>
      </div>}
      {chat.turns.map((turn,index)=><div className="coach-turn" key={turn.id}>
        <div className="coach-user">{turn.prompt}</div>
        {turn.answer?<CoachMarkdown text={turn.answer}/>:index===chat.turns.length-1&&chat.partial?<CoachMarkdown text={chat.partial}/>:null}
        {turn.answer&&<div className="coach-evidence">
          {turn.evidence&&<details><summary>Supporting evidence</summary><p>{turn.evidence.label}</p>
            {turn.evidence.dates.length>0&&<p>{turn.evidence.dates.join(' · ')}</p>}</details>}
          <button className="coach-copy" aria-label={copied===turn.id?'Copied':'Copy response'} title="Copy response"
            onClick={()=>{
              if(!navigator.clipboard){setCopied('error');return;}
              void navigator.clipboard.writeText(turn.answer!).then(()=>setCopied(turn.id),()=>setCopied('error'));
            }}>
            {copied===turn.id?<Check size={16} aria-hidden="true"/>:<Copy size={16} aria-hidden="true"/>}</button>
          {copied==='error'&&<span role="status">Clipboard unavailable</span>}
        </div>}
      </div>)}
      {chat.generating&&!chat.partial&&<p role="status" className="muted">Coach is preparing a reply…</p>}
      {chat.loading&&<p role="status" className="muted">Loading conversations…</p>}
    </div>
    {chat.error&&<p className="notice" role="alert">{chat.error}</p>}
    {chat.turns.at(-1)?.answer&&!chat.busy&&!draft&&<div className="inline coach-followups" aria-label="Suggested follow-ups">
      {chatSuggestions(chat.turns.at(-1)?.prompt).slice(0,2).map(question=><button type="button" className="quiet"
        key={question} disabled={blocked} onClick={()=>setDraft(question)}>{question}</button>)}
    </div>}
    {chat.turns.length>0&&!chat.turns.at(-1)?.answer&&!chat.busy&&<div><button className="quiet" disabled={blocked} onClick={chat.retry}>Retry reply</button></div>}
    <form className="coach-composer" onSubmit={event=>{event.preventDefault();if(!blocked) chat.send(draft,()=>setDraft(''));}}>
      <textarea aria-label="Message Coach" placeholder="Ask about your fitness…" value={draft} rows={2} maxLength={1800}
        ref={composer} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{
          if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit();}
        }}/>
      {chat.generating?<button type="button" className="button secondary" onClick={chat.stop}>Stop</button>:
        <button className="button" disabled={disabled||!draft.trim()}>Send</button>}
    </form>
  </section>;
}
