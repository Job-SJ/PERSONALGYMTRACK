import {useEffect,useState} from 'react';
import {AppState,Linking,ScrollView,StatusBar,Text,TextInput,View,useColorScheme} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import type {Session} from '@supabase/supabase-js';
import {appUrl,authRedirect,consumeAuthLink,signOutLocal,supabase,validOrigin} from './session';
import {Workspace} from './Workspace';

import {Button,palette,ui} from './ui';

export default function App(){
  return <SafeAreaProvider><Gate/></SafeAreaProvider>;
}

function Gate(){
  const scheme=useColorScheme();
  const p=palette(scheme==='light');
  const [session,setSession]=useState<Session|null>(null);
  const [level,setLevel]=useState<'check'|'auth'|'mfa'|'ok'>('check');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [code,setCode]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [passwordRequired,setPasswordRequired]=useState(false);
  useEffect(()=>{
    if(!supabase) return;
    const client=supabase;
    let live=true;
    void client.auth.getSession().then(({data,error})=>{if(live){setSession(data.session);if(error)setNotice('Sign in again to restore access.');}});
    const {data:{subscription}}=client.auth.onAuthStateChange((event,next)=>{
      setSession(next);
      if(event==='PASSWORD_RECOVERY') setPasswordRequired(true);
      if(event==='SIGNED_OUT'){setPasswordRequired(false);setPassword('');setCode('');}
    });
    const state=AppState.addEventListener('change',value=>{if(value==='active') client.auth.startAutoRefresh();else client.auth.stopAutoRefresh();});
    const handle=(uri:string|null|undefined)=>{
      if(!uri||!live) return;
      void consumeAuthLink(uri).then(type=>{if(live&&type==='recovery')setPasswordRequired(true);})
        .catch(error=>{if(live)setNotice(error.message);});
    };
    const link=Linking.addEventListener('url',event=>handle(event.url));
    void Linking.getInitialURL().then(handle);
    return ()=>{live=false;subscription.unsubscribe();state.remove();link.remove();client.auth.stopAutoRefresh();};
  },[]);
  useEffect(()=>{
    let active=true;
    if(!session||!supabase) return;
    const client=supabase;
    void client.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token).then(({data,error})=>{
      if(!active) return;
      if(error){setNotice('Your session could not be verified. Sign in again.');setLevel('auth');return;}
      setLevel(data.nextLevel==='aal2'&&data.currentLevel!=='aal2'?'mfa':'ok');
    }).catch(()=>{if(active){setNotice('Your session could not be verified.');setLevel('auth');}});
    return ()=>{active=false;};
  },[session]);
  const operation=async(fn:()=>Promise<void>)=>{
    if(busy) return;
    setBusy(true);setNotice('');
    try{await fn();}catch(error){setNotice(error instanceof Error?error.message:'Try again.');}
    finally{setBusy(false);}
  };
  const client=supabase;
  const leave=async()=>{await signOutLocal();setSession(null);setLevel('auth');};
  if(!client||!validOrigin(appUrl)) return <SafeAreaView style={[ui.safe,{backgroundColor:p.bg}]}><View style={ui.content}>
    <Text style={[ui.title,{color:p.text}]}>Configure your workspace</Text><Text style={[ui.text,{color:p.muted}]}>Set the public Supabase and GymTrack URLs in the Expo environment.</Text>
  </View></SafeAreaView>;
  if(session&&level==='ok'&&!passwordRequired) return <Workspace key={session.user.id} session={session} signOut={leave}/>;
  return <SafeAreaView style={[ui.safe,{backgroundColor:p.bg}]}>
    <StatusBar barStyle={scheme==='light'?'dark-content':'light-content'}/>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
      <Text style={[ui.section,{color:p.accent}]}>PERSONALGYMTRACK</Text>
      <Text style={[ui.title,{color:p.text}]}>{session&&level==='mfa'?'Verify your sign-in':session&&passwordRequired?'Set your password':'Welcome back.'}</Text>
      {notice&&<Text accessibilityLiveRegion="polite" style={[ui.text,{color:p.muted}]}>{notice}</Text>}
      {session&&level==='check'?<Text style={{color:p.muted}}>Verifying your session…</Text>:session&&level==='mfa'?<>
        <TextInput accessibilityLabel="Authenticator code" keyboardType="number-pad" autoComplete="one-time-code" placeholder="Authenticator code" maxLength={6}
          placeholderTextColor={p.muted} style={[ui.input,{color:p.text,borderColor:p.line}]} value={code} onChangeText={setCode}/>
        <Button p={p} accent text="Verify" disabled={busy||!/^\d{6}$/.test(code)} action={()=>void operation(async()=>{
          const factors=await client.auth.mfa.listFactors();
          const factor=factors.data?.totp[0];
          if(!factor) throw new Error('Authenticator unavailable.');
          const result=await client.auth.mfa.challengeAndVerify({factorId:factor.id,code});
          if(result.error) throw new Error('The authenticator code could not be verified.');
          setCode('');
        })}/>
      </>:session&&passwordRequired?<>
        <TextInput accessibilityLabel="New password" secureTextEntry autoComplete="new-password" placeholder="New password" placeholderTextColor={p.muted}
          style={[ui.input,{color:p.text,borderColor:p.line}]} value={password} onChangeText={setPassword}/>
        <Button p={p} accent text="Save password" disabled={busy||password.length<12||password.length>72} action={()=>void operation(async()=>{
          const result=await client.auth.updateUser({password});
          if(result.error) throw new Error('The password could not be saved.');
          setPassword('');setPasswordRequired(false);
        })}/>
      </>:<>
        <TextInput accessibilityLabel="Email" placeholder="Email" placeholderTextColor={p.muted} keyboardType="email-address" autoCapitalize="none" autoComplete="email"
          style={[ui.input,{color:p.text,borderColor:p.line}]} value={email} onChangeText={setEmail}/>
        <TextInput accessibilityLabel="Password" placeholder="Password" placeholderTextColor={p.muted} secureTextEntry autoComplete="current-password"
          style={[ui.input,{color:p.text,borderColor:p.line}]} value={password} onChangeText={setPassword}/>
        <Button p={p} accent text="Sign in" disabled={busy||!email.trim()||!password} action={()=>void operation(async()=>{
          setLevel('check');
          const result=await client.auth.signInWithPassword({email:email.trim(),password});
          if(result.error) throw new Error('Sign-in could not be completed.');
          setPassword('');
        })}/>
        <Button p={p} text="Send password reset link" disabled={busy||!email.trim()} action={()=>void operation(async()=>{
          await client.auth.resetPasswordForEmail(email.trim(),{redirectTo:authRedirect});
          setNotice('Check your inbox for a reset link.');
        })}/>
      </>}
      {session&&<Button p={p} text="Sign out" disabled={busy} action={()=>void operation(leave)}/>}
    </ScrollView>
  </SafeAreaView>;
}
