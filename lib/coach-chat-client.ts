import {useEffect,useRef,useState} from 'react';
import type {ChatCommand,ChatEvent,ChatTurn,Conversation} from './coach-chat';

type ChatResult={conversations?:Conversation[];conversation?:Conversation;turns?:ChatTurn[];turn?:ChatTurn;error?:string};
type Transport=(command:ChatCommand,signal:AbortSignal)=>Promise<Response>;

export async function readChatResponse(response:Response,onDelta:(delta:string)=>void):Promise<ChatResult>{
  if(!response.ok||!response.headers.get('content-type')?.includes('application/x-ndjson')){
    const data=await response.json().catch(()=>null) as ChatResult|null;
    if(!response.ok||!data) throw new Error(data?.error??'Coach is unavailable.');
    return data;
  }
  const reader=response.body?.getReader();
  if(!reader) throw new Error('The chat response did not open.');
  const decoder=new TextDecoder();
  let pending='';
  let turn:ChatTurn|undefined;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done) break;
      pending+=decoder.decode(value,{stream:true});
      const lines=pending.split('\n');
      pending=lines.pop()!;
      for(const line of lines){
        if(!line) continue;
        let event:ChatEvent;
        try{event=JSON.parse(line) as ChatEvent;}
        catch{throw new Error('The chat response was invalid. Retry to continue.');}
        if('error' in event) throw new Error(event.error);
        if('delta' in event) onDelta(event.delta);
        if('turn' in event) turn=event.turn;
      }
    }
  }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
  if(!turn) throw new Error('The response was interrupted. Retry to continue.');
  return {turn};
}

export function useCoachChat(transport:Transport,randomId:()=>string,stream:boolean){
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [selected,setSelected]=useState<string>();
  const [turns,setTurns]=useState<ChatTurn[]>([]);
  const [partial,setPartial]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [loading,setLoading]=useState(true);
  const active=useRef<AbortController|null>(null);
  const lastSend=useRef<Extract<ChatCommand,{action:'send'}>|null>(null);
  const conversation=conversations.find(row=>row.id===selected);
  const request=async(command:ChatCommand,signal:AbortSignal,onDelta:((delta:string)=>void)=()=>{})=>
    readChatResponse(await transport(command,signal),onDelta);

  useEffect(()=>{
    const controller=new AbortController();
    void transport({action:'conversations'},controller.signal).then(result=>readChatResponse(result,()=>{}))
      .then(result=>{if(!controller.signal.aborted) setConversations(result.conversations??[]);})
      .catch(error=>{if(!controller.signal.aborted) setError(error instanceof Error?error.message:'Coach is unavailable.');})
      .finally(()=>{if(!controller.signal.aborted) setLoading(false);});
    return ()=>{controller.abort();active.current?.abort();};
  },[transport]);

  async function run(task:(signal:AbortSignal)=>Promise<void>,generate=false){
    if(active.current) return;
    const controller=new AbortController();
    active.current=controller;
    setBusy(true);setGenerating(generate);setError('');
    try{await task(controller.signal);}
    catch(error){setError(controller.signal.aborted?'Generation stopped.':error instanceof Error?error.message:'Coach is unavailable.');}
    finally{
      active.current=null;
      setBusy(false);setGenerating(false);setPartial('');
    }
  }
  function select(id:string){
    void run(async signal=>{
      const result=await request({action:'conversation',id},signal);
      lastSend.current=null;
      setTurns(result.turns??[]);setSelected(id);
    });
  }
  function newChat(){
    if(active.current) return;
    lastSend.current=null;
    setTurns([]);setSelected(undefined);setError('');
  }
  async function generate(command:Extract<ChatCommand,{action:'send'|'retry'}>,signal:AbortSignal,incremental=stream){
    const result=await request({...command,stream:incremental},signal,delta=>setPartial(value=>value+delta));
    if(!result.turn) throw new Error('The response was interrupted. Retry to continue.');
    const turn=result.turn;
    setTurns(rows=>rows.map(row=>row.id===turn.id?turn:row));
    setPartial('');
    setConversations(rows=>[...rows].sort((a,b)=>Number(b.id===command.id)-Number(a.id===command.id)));
  }
  function send(prompt:string,onStarted:()=>void){
    if(!prompt.trim()||active.current) return;
    void run(async signal=>{
      let id=selected;
      if(!id){
        const result=await request({action:'new-chat',id:randomId()},signal);
        if(!result.conversation) throw new Error('The conversation could not be created.');
        const row=result.conversation;
        id=row.id;
        setSelected(id);
        setConversations(values=>[row,...values]);
      }
      const command={action:'send',id,turn:randomId(),prompt:prompt.trim()} as const;
      lastSend.current=command;
      setTurns(rows=>[...rows,{id:command.turn,prompt:command.prompt,answer:null,created_at:new Date().toISOString()}]);
      onStarted();
      await generate(command,signal);
    },true);
  }
  function retry(){
    const turn=turns.at(-1);
    if(!selected||!turn||turn.answer) return;
    const command=lastSend.current?.turn===turn.id?lastSend.current:{action:'retry' as const,id:selected,turn:turn.id};
    void run(signal=>generate(command,signal,false),true);
  }
  function rename(title:string,onSaved:()=>void){
    if(!selected||!title.trim()) return;
    void run(async signal=>{
      await request({action:'rename-chat',id:selected,title},signal);
      setConversations(rows=>rows.map(row=>row.id===selected?{...row,title:title.trim()}:row));
      onSaved();
    });
  }
  function remove(){
    if(!selected) return;
    void run(async signal=>{
      await request({action:'delete-chat',id:selected},signal);
      setConversations(rows=>rows.filter(row=>row.id!==selected));
      setSelected(undefined);setTurns([]);
    });
  }
  function clear(){
    setConversations([]);newChat();
  }
  return {conversations,conversation,turns,partial,error,busy,generating,loading,select,newChat,send,retry,rename,remove,clear,
    stop:()=>active.current?.abort()};
}
