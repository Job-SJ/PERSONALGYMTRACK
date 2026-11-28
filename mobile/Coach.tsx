import {useCallback,useEffect,useRef,useState,type ComponentRef} from 'react';
import {KeyboardAvoidingView,Platform,ScrollView,Text,TextInput,View} from 'react-native';
import {uuid} from 'expo';
import {fetch as expoFetch} from 'expo/fetch';
import type {Session} from '@supabase/supabase-js';
import {chatConsent,chatSuggestions,type ChatCommand} from '../lib/coach-chat';
import {useCoachChat} from '../lib/coach-chat-client';
import {coachMarkdown} from '../lib/coach-markdown';
import {topics,type Topic} from '../lib/coach-topics';
import {reserveMicros,type CoachDiscovery,type CoachModel} from '../lib/coach-provider';
import {coachReadiness,defaultCoachBudget,recommendCoachModels,type CoachConnectionIssue} from '../lib/coach-setup';
import {appUrl,mobileRequest,validOrigin} from './session';
import {Button,ui,type Palette} from './ui';

type Status={personal:boolean;instance:boolean;setting:{enabled:boolean;chatConsent:boolean;credential_source:'personal'|'instance';monthly_micros:number}|null;
  usage:{requests:number;usd:number};history:{id:string;topic:Topic;answer:string}[];connectionIssue?:CoachConnectionIssue};

function Markdown({value,p}:{value:string;p:Palette}){
  return <View>{coachMarkdown(value).map(({kind,parts},index)=><Text selectable key={index} style={[ui.text,{color:p.text,
    fontWeight:kind==='heading'?'700':'400',fontFamily:kind==='code'?'monospace':undefined,marginLeft:kind==='list'?10:0}]}>
    {parts.map((part,i)=><Text key={i} style={{fontWeight:part.style==='strong'?'700':undefined,
      fontStyle:part.style==='emphasis'?'italic':undefined,fontFamily:part.style==='code'?'monospace':undefined}}>{part.text}</Text>)}
  </Text>)}</View>;
}

export function MobileCoach({session,p}:{session:Session;p:Palette}){
  const transport=useCallback(async(command:ChatCommand,signal:AbortSignal)=>{
    if(!validOrigin(appUrl)) throw new Error('Configure an HTTPS GymTrack workspace URL.');
    const request={method:'POST',signal,redirect:'error' as const,headers:{
      Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',
    },body:JSON.stringify(command)};
    return Platform.OS==='web'?fetch(appUrl+'/api/coach',request):expoFetch(appUrl+'/api/coach',request);
  },[session.access_token]);
  const chat=useCoachChat(transport,uuid.v4,true);
  const scroll=useRef<ComponentRef<typeof ScrollView>>(null);
  const [draft,setDraft]=useState('');
  const [rename,setRename]=useState<string>();
  const [list,setList]=useState(false);
  const [remove,setRemove]=useState(false);
  const [clear,setClear]=useState(false);
  const [earlier,setEarlier]=useState(false);
  const [setup,setSetup]=useState(false);
  const [status,setStatus]=useState<Status>();
  const [source,setSource]=useState<'personal'|'instance'>('personal');
  const [budget,setBudget]=useState(String(defaultCoachBudget));
  const [key,setKey]=useState('');
  const [models,setModels]=useState<CoachModel[]>([]);
  const [modelIndex,setModelIndex]=useState(0);
  const [consent,setConsent]=useState(false);
  const [approved,setApproved]=useState(false);
  const [advanced,setAdvanced]=useState(false);
  const [search,setSearch]=useState('');
  const [evidence,setEvidence]=useState<string>();
  const [working,setWorking]=useState(false);
  const [notice,setNotice]=useState('');
  const [checking,setChecking]=useState(true);
  const model=models[modelIndex];
  const readiness=status?coachReadiness(status):null;
  const ready=Boolean(status&&!readiness);
  const {featured}=recommendCoachModels(models);
  const disabled=working||chat.busy;
  const input=[ui.input,{color:p.text,borderColor:p.line}];
  const caption=[ui.text,{color:p.muted}];
  useEffect(()=>{
    const abort=new AbortController();
    void mobileRequest<Status>(session,'/api/coach',undefined,abort.signal).then(result=>{
      if(abort.signal.aborted) return;
      setStatus(result);
      if(result.setting?.monthly_micros) setBudget(String(result.setting.monthly_micros/1_000_000));
      setSource(result.setting?.credential_source??'personal');
    }).catch(error=>{if(!abort.signal.aborted) setNotice(error.message);})
      .finally(()=>{if(!abort.signal.aborted) setChecking(false);});
    return ()=>abort.abort();
  },[session]);
  useEffect(()=>{if(!setup&&!list) scroll.current?.scrollToEnd({animated:false});},[chat.turns,chat.partial,setup,list]);
  async function refresh(){
    setChecking(true);setNotice('');
    try{setStatus(await mobileRequest<Status>(session,'/api/coach'));}
    catch(error){setNotice(error instanceof Error?error.message:'Coach is unavailable.');}
    finally{setChecking(false);}
  }
  async function configure(command:object,discover=false){
    if(disabled) return;
    setWorking(true);setNotice('');
    try{
      if(discover){
        const result=await mobileRequest<CoachDiscovery>(session,'/api/coach',command);
        const {grouped,featured}=recommendCoachModels(result.models);
        setModels(grouped);setModelIndex(featured[0]?grouped.indexOf(featured[0].model):0);
        setApproved(false);setNotice(result.diagnostic??'Connection verified. Choose a model.');
      }else{
        await mobileRequest(session,'/api/coach',command);
        setConsent(false);setSetup(false);
        if('action' in command&&command.action==='delete-history'){chat.clear();setClear(false);}
        if('action' in command&&command.action==='remove') setModels([]);
      }
      setStatus(await mobileRequest<Status>(session,'/api/coach'));
    }catch(error){setNotice(error instanceof Error?error.message:'Coach settings could not be saved.');}
    finally{setWorking(false);}
  }
  return <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1,paddingHorizontal:14,gap:8}}>
    <View style={ui.row}>
      <Text style={[ui.title,{color:p.text,flex:1}]}>Coach</Text>
      {ready&&<Button p={p} text="New chat" disabled={disabled} action={()=>{chat.newChat();setDraft('');setRename(undefined);setRemove(false);setList(false);setSetup(false);}}/>}
      {ready&&<Button p={p} text="Chats" disabled={disabled} action={()=>{setList(!list);setSetup(false);}}/>}
      <Button p={p} text="Settings" disabled={disabled} action={()=>{
        setSetup(!setup);setList(false);
        if(!setup) void refresh();
      }}/>
    </View>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:12,paddingVertical:6}}
      onContentSizeChange={()=>{if(chat.generating) scroll.current?.scrollToEnd({animated:false});}}>
      {notice&&<Text accessibilityLiveRegion="polite" style={caption}>{notice}</Text>}
      {ready&&chat.error&&<Text accessibilityLiveRegion="polite" style={caption}>{chat.error}</Text>}
      {setup?<View style={[ui.panel,{borderColor:p.line}]}>
        <Text style={[ui.section,{color:p.text}]}>{model?'Choose your model':'Connect OpenRouter'}</Text>
        {status?.setting&&<Text style={caption}>{status.usage.requests} requests · ${status.usage.usd.toFixed(4)} of ${(status.setting.monthly_micros/1_000_000).toFixed(2)} this UTC month</Text>}
        {status?.instance&&<Button p={p} text={source==='instance'?'Using instance key':'Using personal key'} disabled={working}
          action={()=>{setSource(source==='instance'?'personal':'instance');setModels([]);setKey('');}}/>}
        {!model&&source==='personal'&&<TextInput accessibilityLabel="OpenRouter API key" placeholder={status?.personal?'Replacement key (optional)':'OpenRouter API key'}
          placeholderTextColor={p.muted} style={input} secureTextEntry autoCorrect={false} autoCapitalize="none" autoComplete="off"
          value={key} onChangeText={setKey} maxLength={512}/>}
        {!model&&<Button p={p} text="Connect and find models" disabled={working||(!key.trim()&&source==='personal'&&!status?.personal)}
          action={()=>{const replacement=key.trim();setKey('');void configure({action:'discover',source,...(replacement?{key:replacement}:{})},true);}}/>}
        {model&&<>
          <Text style={caption}>{model.name} · {model.provider} · {model.free?'Free':`$${(model.prompt*1_000_000).toFixed(3)} input / $${(model.completion*1_000_000).toFixed(3)} output per million tokens`}</Text>
          {featured.map(({label,model:option})=><Button key={option.model} p={p} text={label+' · '+option.name}
            accent={model.model===option.model} action={()=>{setModelIndex(models.indexOf(option));setApproved(false);}}/>)}
          <Button p={p} text={advanced?'Hide advanced settings':'Search models and edit spending limit'} action={()=>setAdvanced(!advanced)}/>
          {advanced&&<>
            <TextInput accessibilityLabel="Search models" style={input} value={search} onChangeText={setSearch}/>
            {models.filter(row=>row.name.toLowerCase().includes(search.toLowerCase())).slice(0,10)
              .map(option=><Button key={option.model} p={p} text={option.name} action={()=>{setModelIndex(models.indexOf(option));setApproved(false);}}/>)}
            {!model.free&&<TextInput accessibilityLabel="GymTrack monthly limit in USD" placeholder="GymTrack monthly limit in USD"
              placeholderTextColor={p.muted} style={input} keyboardType="decimal-pad" value={budget}
              onChangeText={value=>{setBudget(value);setApproved(false);}} maxLength={8}/>}
          </>}
          {!model.free&&<>
            <Text style={caption}>GymTrack monthly limit: ${budget}. OpenRouter credits are separate.</Text>
            <Button p={p} text={approved?'Spending limit approved':'Approve spending limit'} accent={approved} action={()=>setApproved(!approved)}/>
          </>}
        </>}
        {(model||(status?.setting?.enabled&&!ready))&&<>
          <Text style={caption}>{chatConsent}</Text>
          <Button p={p} text={consent?'Consent confirmed':'I agree'} accent={consent} disabled={working} action={()=>setConsent(!consent)}/>
          <Button p={p} text="Enable chat" disabled={working||!consent||Boolean(model&&!model.free&&(!approved||!budget.trim()||!(Number(budget)>=0&&Number(budget)<=50)||
            reserveMicros(model)>Number(budget)*1_000_000))} action={()=>void configure(model?
            {action:'enable',source,selection:model,monthlyUsd:model.free?0:Number(budget),consent:true,chatConsent:true}:{action:'chat-consent',consent:true})}/>
        </>}
        {status?.setting?.enabled&&<Button p={p} text="Disable Coach" disabled={working} action={()=>void configure({action:'disable'})}/>}
        {status?.personal&&<Button p={p} text="Remove personal key" disabled={working} action={()=>void configure({action:'remove'})}/>}
        <Button p={p} text="Delete all conversations" disabled={working} action={()=>setClear(!clear)}/>
        {clear&&<Button p={p} text="Confirm deletion of all conversations" disabled={working} action={()=>void configure({action:'delete-history'})}/>}
      </View>:readiness?<View style={{gap:8}}>
        <Text style={caption}>{readiness.reason}</Text><Button p={p} text={readiness.action} disabled={checking}
          action={()=>status?.connectionIssue==='provider-outage'?void refresh():setSetup(true)}/>
      </View>:!status?(checking?<Text style={caption}>Checking Coach connection…</Text>:
        <Button p={p} text="Retry readiness check" action={()=>void refresh()}/>):list?<View style={{gap:6}}>
        <Text style={[ui.section,{color:p.text}]}>Conversations</Text>
        {chat.conversations.map(row=><Button p={p} key={row.id} text={row.title==='New chat'?new Date(row.updated_at).toLocaleString():row.title}
          disabled={disabled} action={()=>{chat.select(row.id);setList(false);setDraft('');setRename(undefined);setRemove(false);}}/>)}
        {!chat.conversations.length&&<Text style={caption}>No saved conversations.</Text>}
        {Boolean(status?.history.length)&&<Button p={p} text="Earlier Coach replies" action={()=>setEarlier(!earlier)}/>}
        {earlier&&status?.history.map(row=><View key={row.id} style={[ui.panel,{borderColor:p.line}]}>
          <Text style={[ui.section,{color:p.text}]}>{topics[row.topic]}</Text><Markdown value={row.answer} p={p}/>
        </View>)}
      </View>:<>
        {chat.conversation&&<View style={ui.row}>
          <Text numberOfLines={1} style={[ui.section,{color:p.text,flex:1}]}>{chat.conversation.title}</Text>
          <Button p={p} text="Rename" disabled={disabled} action={()=>setRename(chat.conversation?.title)}/>
          <Button p={p} text="Delete" disabled={disabled} action={()=>setRemove(true)}/>
        </View>}
        {rename!==undefined&&<View style={ui.row}>
          <TextInput accessibilityLabel="Conversation title" style={[...input,{flex:1}]} value={rename} onChangeText={setRename} maxLength={80}/>
          <Button p={p} text="Save" disabled={disabled||!rename.trim()} action={()=>chat.rename(rename,()=>setRename(undefined))}/>
          <Button p={p} text="Cancel" action={()=>setRename(undefined)}/>
        </View>}
        {remove&&<View style={ui.row}>
          <Button p={p} text="Confirm deletion" disabled={disabled} action={()=>{chat.remove();setRemove(false);}}/>
          <Button p={p} text="Cancel" action={()=>setRemove(false)}/>
        </View>}
        {!chat.turns.length&&<>
          <Text style={[ui.section,{color:p.text}]}>What would you like to work on?</Text>
          {ready?chatSuggestions().map(question=><Button key={question} p={p} text={question} disabled={disabled} action={()=>setDraft(question)}/>):
            <Button p={p} text="Open Coach settings" action={()=>setSetup(true)}/>}
        </>}
        {chat.turns.map((turn,index)=><View key={turn.id} style={{gap:8}}>
          <Text style={[ui.text,{color:p.text,backgroundColor:p.panel,borderRadius:14,padding:10,alignSelf:'flex-end',maxWidth:'90%'}]}>{turn.prompt}</Text>
          {turn.answer?<Markdown value={turn.answer} p={p}/>:index===chat.turns.length-1&&chat.partial?<Markdown value={chat.partial} p={p}/>:null}
          {turn.evidence&&<View style={{alignItems:'flex-start'}}>
            <Button p={p} text={evidence===turn.id?'Hide evidence':'Supporting evidence'} action={()=>setEvidence(evidence===turn.id?undefined:turn.id)}/>
            {evidence===turn.id&&<Text style={caption}>{turn.evidence.details?.length?
              [turn.evidence.label,...turn.evidence.details].join('\n\n'):[turn.evidence.label,...turn.evidence.dates].join(' · ')}</Text>}
          </View>}
        </View>)}
        {chat.loading&&<Text style={caption}>Loading conversations…</Text>}
        {chat.generating&&!chat.partial&&<Text style={caption}>Coach is preparing a reply…</Text>}
        {ready&&chat.turns.at(-1)?.answer&&!disabled&&!draft&&<View style={ui.row}>
          {chatSuggestions(chat.turns.at(-1)?.prompt).slice(0,2).map(question=><Button key={question} p={p} text={question} action={()=>setDraft(question)}/>)}
        </View>}
        {ready&&chat.turns.length>0&&!chat.turns.at(-1)?.answer&&!chat.busy&&<Button p={p} text="Retry reply" action={chat.retry}/>}
      </>}
    </ScrollView>
    {ready&&!setup&&!list&&<>
      <View style={[ui.row,{flexWrap:'nowrap'}]}>
        <TextInput accessibilityLabel="Message Coach" multiline editable={ready} maxLength={1800} style={[...input,{flex:1,maxHeight:110}]}
          placeholder="Ask about your fitness…" placeholderTextColor={p.muted} value={draft} onChangeText={setDraft}/>
        {chat.generating?<Button p={p} text="Stop" action={chat.stop}/>:<Button p={p} accent text="Send" disabled={!ready||disabled||!draft.trim()}
          action={()=>chat.send(draft,()=>setDraft(''))}/>}
      </View>
      <Text style={[caption,{fontSize:12,lineHeight:16,paddingBottom:6}]}>Your selected AI provider processes your typed messages and recent conversation context.</Text>
    </>}
  </KeyboardAvoidingView>;
}
