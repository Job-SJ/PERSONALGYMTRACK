import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Linking,Pressable,ScrollView,StatusBar,StyleSheet,Text,TextInput,View,useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {Session} from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import type {MobileOverview,MobileTab} from '../lib/mobile-contract';
import {MobileCoach} from './Coach';
import {MobileMealPreview} from './MealPreview';
import {portionValues,sumPortions} from '../lib/nutrition';
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
  const [inbox,setInbox]=useState<Inbox>();
  const [error,setError]=useState('');
  const [note,setNote]=useState('');
  const [weight,setWeight]=useState('');
  const [hevyKey,setHevyKey]=useState('');
  const [enrollment,setEnrollment]=useState<{id:string;secret:string}>();
  const [verification,setVerification]=useState('');
  const [pushing,setPushing]=useState(false);
  const [running,setRunning]=useState<AbortController>();
  const operation=useRef<AbortController|null>(null);
  const busy=Boolean(running);
  const p=palette(data?.theme==='light'||(!data&&scheme==='light'),data?.theme==='oled');
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
    if(tab!=='Settings') return;
    const controller=new AbortController();
    void mobileRequest<Inbox>(session,'/api/notifications',undefined,controller.signal).then(setInbox)
      .catch(error=>{if(!controller.signal.aborted)setError(error.message);});
    void SecureStore.getItemAsync(registrationKey).then(token=>{if(!controller.signal.aborted)setPushing(Boolean(token));}).catch(()=>undefined);
    return ()=>controller.abort();
  },[tab,session]);
  async function run(fn:(signal:AbortSignal)=>Promise<void>,done=''){
    if(operation.current) return;
    const controller=new AbortController();
    operation.current=controller;
    setRunning(controller);
    setError('');setNote('');
    try{await fn(controller.signal);if(done&&!controller.signal.aborted)setNote(done);}
    catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Try again.');}
    finally{operation.current=null;setRunning(undefined);}
  }
  const refresh=async(signal:AbortSignal)=>setData(await mobileRequest(session,'/api/mobile',undefined,signal));
  const write=(command:object,done:string)=>void run(async signal=>{
    await mobileRequest(session,'/api/mobile',command,signal);
    await refresh(signal);
  },done);
  const openWeb=(path:string)=>void Linking.openURL(appUrl+path).catch(()=>setError('Open the workspace in your browser.'));
  const macros=sumPortions(data?.entries.map(row=>row.portion)??[]);
  const knownKcal=data?.entries.reduce((sum,row)=>sum+(portionValues(row.portion).kcal??0),0)??0;
  return <SafeAreaView style={[ui.safe,{backgroundColor:p.bg}]}>
    <StatusBar barStyle={p.onAccent==='#fff'?'dark-content':'light-content'}/>
    <View style={[style.header,{borderColor:p.line}]}>
      <Text style={{color:p.accent,fontWeight:'700'}}>PERSONALGYMTRACK</Text>
      <Button text={tab==='Settings'?'Refresh':'Settings'} p={p} disabled={busy} action={()=>tab==='Settings'?void run(refresh):setTab('Settings')}/>
    </View>
    {tab==='Coach'?<MobileCoach session={session} p={p} refreshDiary={()=>void run(refresh)}/>:<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
      <Text style={[ui.title,text]}>{tab}</Text>
      {error&&<Text accessibilityLiveRegion="polite" style={[ui.text,text]}>{error}</Text>}
      {note&&<Text accessibilityLiveRegion="polite" style={[ui.text,text]}>{note}</Text>}
      {busy&&<Line p={p}>Working…</Line>}
      {!data&&tab!=='Settings'&&<Line p={p}>Connecting to your workspace…</Line>}
      {tab==='Today'&&data&&<>
        <Panel title="Daily Intelligence" p={p}><Line p={p}>{data.summary}</Line>
          {data.headlines.map(row=><Line p={p} key={row.label}>{row.label} · {row.value}</Line>)}</Panel>
        <Panel title="Nutrition today" p={p}><Line p={p}>{data.entries.length?macros.kcal==null?`${Math.round(knownKcal)} known kcal logged.`:`${Math.round(macros.kcal)} kcal logged.`:'Your diary is open.'}</Line>
          <Button p={p} text="Open nutrition" action={()=>setTab('Nutrition')}/></Panel>
      </>}
      {tab==='Training'&&data&&<>
        {data.hevyConnected?<Button p={p} accent text="Sync workouts" disabled={busy}
          action={()=>write({action:'sync'},'Workout history updated.')}/>:data.hevyAvailable?
          <Panel title="Connect Hevy" p={p}>
            <TextInput accessibilityLabel="Hevy API key" value={hevyKey} onChangeText={setHevyKey} editable={!busy}
              placeholder="Hevy API key" placeholderTextColor={p.muted} style={[ui.input,text,{borderColor:p.line}]}
              secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={512}/>
            <Button p={p} accent text="Connect and sync" disabled={busy||hevyKey.trim().length<8} action={()=>void run(async signal=>{
              const key=hevyKey.trim();
              setHevyKey('');
              const result=await mobileRequest<{notice?:string}>(session,'/api/mobile',{action:'connect-hevy',key},signal);
              await refresh(signal);
              setNote(result.notice??'Hevy connected and workouts synced.');
            })}/>
          </Panel>:<Button p={p} text="Open Hevy settings" action={()=>openWeb('/app/integrations')}/>}
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
        <MobileMealPreview key={data.today} day={data.today} p={p} session={session} refresh={()=>void run(refresh)}/>
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
    </ScrollView>}
    <View accessibilityRole="tablist" style={[style.tabs,{borderColor:p.line,backgroundColor:p.panel}]}>
      {tabs.filter(value=>value!=='Settings').map(value=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:tab===value}}
        style={[style.tab,tab===value&&{backgroundColor:p.raised,borderRadius:8}]} onPress={()=>{setError('');setNote('');setTab(value);}}>
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
