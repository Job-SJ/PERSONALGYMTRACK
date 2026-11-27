import {useEffect,useState,type ReactNode} from 'react';
import {Linking,Pressable,ScrollView,StatusBar,StyleSheet,Text,TextInput,View,useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {Session} from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import type {FoodResults,MobileCoach,MobileOverview,MobileTab} from '../lib/mobile-contract';
import {topics,type Topic} from '../lib/coach-topics';
import {sumPortions,type Food,type Meal,meals} from '../lib/nutrition';
import {categories,type Category} from '../lib/notification-rules';
import {appUrl,mobileRequest,supabase} from './session';
import {Button,palette,ui,type Palette} from './ui';

const tabs:MobileTab[]=['Today','Nutrition','Training','Progress','Coach','Settings'];
const project=process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const registrationKey='pgt-expo-notification-device';
type Inbox={history:{id:string;category:Category;created_at:string;read_at:string|null}[]};

function Panel({title,p,children}:{title:string;p:Palette;children:ReactNode}){
  return <View style={[ui.panel,{borderColor:p.line,backgroundColor:p.panel}]}>
    <Text style={[ui.section,{color:p.text}]}>{title}</Text>{children}
  </View>;
}
function Line({children,p}:{children:ReactNode;p:Palette}){
  return <Text style={[ui.text,{color:p.muted}]}>{children}</Text>;
}
function Input({p,label,value,set,numeric=false}:{p:Palette;label:string;value:string;set:(next:string)=>void;numeric?:boolean}){
  return <TextInput accessibilityLabel={label} style={[ui.input,{color:p.text,borderColor:p.line}]}
    placeholder={label} placeholderTextColor={p.muted} value={value} onChangeText={set} keyboardType={numeric?'decimal-pad':'default'} maxLength={80}/>;
}

async function setPushRegistration(session:Session,enabled:boolean){
  let token=await SecureStore.getItemAsync(registrationKey);
  if(enabled){
    if(!project) throw new Error('Configure an EAS project ID in the development build.');
    await Notifications.setNotificationChannelAsync('updates',{name:'GymTrack updates',importance:Notifications.AndroidImportance.DEFAULT});
    if((await Notifications.requestPermissionsAsync()).status!=='granted') throw new Error('Allow notifications in your device settings.');
    token=(await Notifications.getExpoPushTokenAsync({projectId:project})).data;
  }
  if(!token) return;
  await mobileRequest(session,'/api/notifications',{action:enabled?'register':'unregister',device:{channel:'expo',subscription:{token}}});
  if(enabled) await SecureStore.setItemAsync(registrationKey,token);
  else await SecureStore.deleteItemAsync(registrationKey);
}

export function Workspace({session,signOut}:{session:Session;signOut:()=>Promise<void>}){
  const scheme=useColorScheme();
  const [tab,setTab]=useState<MobileTab>('Today');
  const [data,setData]=useState<MobileOverview>();
  const [coach,setCoach]=useState<MobileCoach>();
  const [inbox,setInbox]=useState<Inbox>();
  const [error,setError]=useState('');
  const [note,setNote]=useState('');
  const [query,setQuery]=useState('');
  const [foods,setFoods]=useState<Food[]>([]);
  const [food,setFood]=useState<Food>();
  const [amount,setAmount]=useState('100');
  const [meal,setMeal]=useState<Meal>('Lunch');
  const [weight,setWeight]=useState('');
  const [enrollment,setEnrollment]=useState<{id:string;secret:string}>();
  const [verification,setVerification]=useState('');
  const [pushing,setPushing]=useState(false);
  const [running,setRunning]=useState<AbortController>();
  const busy=Boolean(running);
  const p=palette(data?.theme==='light'||(!data&&scheme==='light'));
  const text={color:p.text};
  useEffect(()=>{
    const controller=new AbortController();
    void mobileRequest<MobileOverview>(session,'/api/mobile',undefined,controller.signal).then(setData)
      .catch(error=>{if(!controller.signal.aborted)setError(error.message);});
    return ()=>controller.abort();
  },[session]);
  useEffect(()=>()=>running?.abort(),[running]);
  useEffect(()=>{
    const handler=Notifications.addNotificationResponseReceivedListener(()=>setTab('Settings'));
    if(Notifications.getLastNotificationResponse()?.notification) queueMicrotask(()=>setTab('Settings'));
    return ()=>handler.remove();
  },[]);
  useEffect(()=>{
    if(tab!=='Coach'&&tab!=='Settings') return;
    const controller=new AbortController();
    if(tab==='Coach') void mobileRequest<MobileCoach>(session,'/api/coach',undefined,controller.signal).then(setCoach)
      .catch(error=>{if(!controller.signal.aborted)setError(error.message);});
    else{
      void mobileRequest<Inbox>(session,'/api/notifications',undefined,controller.signal).then(setInbox)
        .catch(error=>{if(!controller.signal.aborted)setError(error.message);});
      void SecureStore.getItemAsync(registrationKey).then(token=>{if(!controller.signal.aborted)setPushing(Boolean(token));}).catch(()=>undefined);
    }
    return ()=>controller.abort();
  },[tab,session]);
  async function run(fn:(signal:AbortSignal)=>Promise<void>,done=''){
    if(running) return;
    const controller=new AbortController();
    setRunning(controller);
    setError('');setNote('');
    try{await fn(controller.signal);if(!controller.signal.aborted)setNote(done);}
    catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Try again.');}
    finally{setRunning(undefined);}
  }
  const refresh=async(signal:AbortSignal)=>setData(await mobileRequest(session,'/api/mobile',undefined,signal));
  const write=(command:object,done:string)=>void run(async signal=>{
    await mobileRequest(session,'/api/mobile',command,signal);
    await refresh(signal);
  },done);
  const openWeb=(path:string)=>void Linking.openURL(appUrl+path).catch(()=>setError('Open the workspace in your browser.'));
  function askCoach(topic:Topic){
    void run(async signal=>{
      const reply=await mobileRequest<MobileCoach['history'][number]>(session,'/api/coach',{action:'ask',topic},signal);
      setCoach(current=>current&&({...current,history:[reply,...current.history.filter(row=>row.id!==reply.id)].slice(0,20)}));
    });
  }
  const macros=sumPortions(data?.entries.map(row=>row.portion)??[]);
  return <SafeAreaView style={[ui.safe,{backgroundColor:p.bg}]}>
    <StatusBar barStyle={p.bg==='#f4f5ef'?'dark-content':'light-content'}/>
    <View style={[style.header,{borderColor:p.line}]}>
      <Text style={{color:p.accent,fontWeight:'700'}}>PERSONALGYMTRACK</Text>
      <Button text={tab==='Settings'?'Refresh':'Settings'} p={p} disabled={busy} action={()=>tab==='Settings'?void run(refresh):setTab('Settings')}/>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
      <Text style={[ui.title,text]}>{tab==='Coach'?'Your coach. Your journey.':tab}</Text>
      {error&&<Text accessibilityLiveRegion="polite" style={[ui.text,text]}>{error}</Text>}
      {note&&<Text accessibilityLiveRegion="polite" style={[ui.text,text]}>{note}</Text>}
      {busy&&<Line p={p}>Working…</Line>}
      {!data&&tab!=='Coach'&&tab!=='Settings'&&<Line p={p}>Connecting to your workspace…</Line>}
      {tab==='Today'&&data&&<>
        <Panel title="Daily Intelligence" p={p}><Line p={p}>{data.summary}</Line>
          {data.headlines.map(row=><Line p={p} key={row.label}>{row.label} · {row.value}</Line>)}</Panel>
        <Panel title="Nutrition today" p={p}><Line p={p}>{data.entries.length?macros.kcal==null?'Some calories are unknown.':`${Math.round(macros.kcal)} kcal logged.`:'Your diary is open.'}</Line>
          <Button p={p} text="Open nutrition" action={()=>setTab('Nutrition')}/></Panel>
      </>}
      {tab==='Training'&&data&&<>
        <Button p={p} accent text={data.hevyConnected?'Sync Hevy':'Connect Hevy in web settings'} disabled={busy}
          action={()=>data.hevyConnected?write({action:'sync'},'Workout history updated.'):openWeb('/app/integrations')}/>
        {data.workouts.length===0&&<Line p={p}>Import or synchronize workouts to begin.</Line>}
        {data.workouts.map(row=><Panel title={row.title} p={p} key={row.id}><Line p={p}>{row.day} · {row.sets} working sets · {Math.round(row.minutes)} min</Line>
          {row.volume!==null&&<Line p={p}>{Math.round(row.volume).toLocaleString()} kg mapped volume</Line>}</Panel>)}
      </>}
      {tab==='Nutrition'&&data&&<>
        <Panel title={data.today} p={p}>
          {data.target&&<Line p={p}>{Math.round(data.target.kcal)} kcal target</Line>}
          {data.entries.map(row=><View key={row.id} style={ui.row}><Line p={p}>{row.portion.food.name} · {row.portion.amount} {row.portion.unit} · {row.meal}</Line>
            <Button p={p} text="Remove" disabled={busy} action={()=>write({action:'nutrition',command:{type:'delete',id:row.id}},'Food removed.')}/></View>)}
          <Button p={p} text={data.complete?'Reopen diary':'Mark diary complete'} disabled={busy}
            action={()=>write({action:'nutrition',command:{type:'complete',day:data.today,complete:!data.complete}},'Diary updated.')}/>
        </Panel>
        <Panel title="Log food" p={p}>
          <Input p={p} label="Food name or barcode" value={query} set={setQuery}/>
          <Button p={p} text="Search Open Food Facts" disabled={busy||query.trim().length<2} action={()=>void run(async signal=>{
            const result=await mobileRequest<FoodResults>(session,'/api/mobile',{action:'food-search',query:query.trim(),
              mode:/^\d{4,24}$/.test(query.trim())?'barcode':'name'},signal);
            setFoods(result.foods.slice(0,12));
            if(!result.foods.length)setNote('No matching products.');
          })}/>
          {foods.map((item,index)=><Button p={p} text={item.name} key={item.code??index} action={()=>{setFood(item);setAmount(item.basis==='serving'?'1':'100');setFoods([]);}}/>)}
          {food&&<>
            <Line p={p}>{food.name}</Line><Input p={p} numeric label={'Amount ('+food.basis+')'} value={amount} set={setAmount}/>
            <View style={ui.row}>{meals.map(name=><Button p={p} key={name} text={name} accent={meal===name} action={()=>setMeal(name)}/>)}</View>
            <Button p={p} accent text="Log food" disabled={busy||!(Number(amount)>0)} action={()=>void run(async signal=>{
              await mobileRequest(session,'/api/mobile',{action:'nutrition',command:{type:'log',day:data.today,meal,
                portions:[{food,amount:Number(amount),unit:food.basis}]}},signal);
              setFood(undefined);
              await refresh(signal);
            },'Food logged.')}/>
          </>}
        </Panel>
      </>}
      {tab==='Progress'&&data&&<>
        <Panel title="Training trends" p={p}>{data.headlines.map(row=><Line p={p} key={row.label}>{row.label} · {row.value}</Line>)}</Panel>
        <Panel title="Bodyweight" p={p}>
          <Input p={p} numeric label="Bodyweight in kg" value={weight} set={setWeight}/>
          <Button p={p} accent text="Save today’s weight" disabled={busy||!(Number(weight)>0)}
            action={()=>write({action:'weight',day:data.today,kg:Number(weight)},'Bodyweight saved.')}/>
          {data.weight.slice(0,10).map(row=><Line p={p} key={row.day}>{row.day} · {row.value} kg</Line>)}
        </Panel>
      </>}
      {tab==='Coach'&&<>
        <Panel title="Review your records" p={p}>{coach?.setting?.enabled?
          (Object.entries(topics) as [Topic,string][]).map(([topic,label])=><Button p={p} key={topic} text={label} disabled={busy} action={()=>askCoach(topic)}/>):
          <Button p={p} text="Open Coach setup on the web" action={()=>openWeb('/app/coach')}/>}
          {busy&&<Button p={p} text="Cancel request" action={()=>running?.abort()}/>}
        </Panel>
        {coach?.history.map(row=><Panel key={row.id} title={topics[row.topic]} p={p}><Line p={p}>{row.answer}</Line></Panel>)}
      </>}
      {tab==='Settings'&&<>
        <Panel title="Appearance" p={p}><View style={ui.row}>{(['dark','light','oled'] as const).map(theme=>
          <Button p={p} text={theme==='oled'?'OLED':theme} key={theme} accent={theme===data?.theme} disabled={busy}
            action={()=>write({action:'theme',theme},'Appearance updated.')}/>)}</View></Panel>
        <Panel title="Account and integrations" p={p}>
          <Button p={p} text="Manage settings on the web" action={()=>openWeb('/app/settings')}/>
          <Button p={p} text="Set up an authenticator" disabled={busy||Boolean(enrollment)} action={()=>void run(async()=>{
            if(!supabase) return;
            const factors=await supabase.auth.mfa.listFactors();
            if(factors.error||factors.data.totp.length) throw new Error('An authenticator is already connected or setup is unavailable.');
            for(const factor of factors.data.all.filter(row=>row.status==='unverified'&&row.factor_type==='totp')){
              if((await supabase.auth.mfa.unenroll({factorId:factor.id})).error) throw new Error('Clear the pending authenticator in web settings.');
            }
            const result=await supabase.auth.mfa.enroll({factorType:'totp',issuer:'PERSONALGYMTRACK'});
            if(result.error) throw new Error('Authenticator setup could not be started.');
            setEnrollment({id:result.data.id,secret:result.data.totp.secret});
          })}/>
          {enrollment&&<>
            <Line p={p}>Add this setup key to your authenticator app.</Line><Text selectable style={text}>{enrollment.secret}</Text>
            <Input p={p} numeric label="Authenticator code" value={verification} set={setVerification}/>
            <Button p={p} text="Verify authenticator" disabled={busy||!/^\d{6}$/.test(verification)} action={()=>void run(async()=>{
              const result=await supabase?.auth.mfa.challengeAndVerify({factorId:enrollment.id,code:verification});
              if(!result||result.error) throw new Error('The authenticator code could not be verified.');
              setEnrollment(undefined);setVerification('');
            },'Authenticator enabled.')}/>
          </>}
          <Button p={p} text="Sign out" disabled={busy} action={()=>void run(async()=>{
            try{await setPushRegistration(session,false);}catch{
              await SecureStore.deleteItemAsync(registrationKey).catch(()=>undefined);
            }
            await signOut();
          })}/>
        </Panel>
        <Panel title="Notifications" p={p}>
          <Button p={p} text={pushing?'Disable device notifications':'Enable device notifications'} disabled={busy||!project}
            action={()=>void run(async()=>{await setPushRegistration(session,!pushing);setPushing(!pushing);},'Device registration updated.')}/>
          <Button p={p} text="Manage preferences on the web" action={()=>openWeb('/app/notifications')}/>
          {inbox?.history.slice(0,8).map(row=><View key={row.id} style={ui.row}>
            <Line p={p}>{categories[row.category].title}</Line>
            {!row.read_at&&<Button p={p} text="Mark read" disabled={busy} action={()=>void run(async signal=>{
              await mobileRequest(session,'/api/notifications',{action:'read',id:row.id},signal);
              setInbox(await mobileRequest(session,'/api/notifications',undefined,signal));
            })}/>}
          </View>)}
        </Panel>
      </>}
    </ScrollView>
    <View accessibilityRole="tablist" style={[style.tabs,{borderColor:p.line,backgroundColor:p.panel}]}>
      {tabs.filter(value=>value!=='Settings').map(value=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:tab===value}}
        style={style.tab} onPress={()=>{setError('');setNote('');setTab(value);}}>
        <Text style={{color:value===tab?p.accent:p.text,fontSize:12,fontWeight:'600'}}>{value}</Text>
      </Pressable>)}
    </View>
  </SafeAreaView>;
}

const style=StyleSheet.create({
  header:{paddingHorizontal:18,borderBottomWidth:1,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  tabs:{flexDirection:'row',borderTopWidth:1},
  tab:{flex:1,minHeight:49,justifyContent:'center',alignItems:'center'},
});
