import {expect,test} from '@playwright/test';
import {accessToken,userOne,userTwo} from './fixture.mjs';

test('native bearer authentication is isolated and checks authenticator assurance',async({request})=>{
  const noSession=await request.get('/api/mobile');
  expect(noSession.status()).toBe(401);
  const headers=(id:string,aal:string)=>({Authorization:'Bearer '+accessToken(id,aal)});
  const one=await request.get('/api/mobile',{headers:headers(userOne,'aal1')});
  expect(one.status()).toBe(200);
  expect(one.headers()['cache-control']).toContain('no-store');
  expect((await one.json()).workouts[0].title).toBe('Cedar session 1');
  expect((await request.get('/api/mobile',{headers:headers(userTwo,'aal1')})).status()).toBe(403);
  const two=await request.get('/api/mobile',{headers:headers(userTwo,'aal2')});
  expect(two.status()).toBe(200);
  expect((await two.json()).workouts[0].title).toBe('Maple session 1');
  expect((await request.get('/api/coach',{headers:headers(userTwo,'aal1')})).status()).toBe(403);
  expect((await request.post('/api/coach',{headers:headers(userTwo,'aal1'),data:{action:'conversations'}})).status()).toBe(403);
  expect((await request.post('/api/coach',{headers:headers(userOne,'aal1'),data:{action:'send',prompt:'test'}})).status()).toBe(400);
  expect((await request.post('/api/jobs/notifications')).status()).toBe(401);
});

test('signed-in dashboard, integrated Coach and notification center fit the viewport',async({page},info)=>{
  const email=info.project.name==='desktop'?'one@example.invalid':'two@example.invalid';
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('synthetic-password');
  await page.getByRole('button',{name:'Sign in'}).click();
  if(email==='two@example.invalid'){
    await expect(page.getByRole('heading',{name:'Verify your sign-in'})).toBeVisible();
    await page.getByLabel('Authenticator code').fill('123456');
    await page.getByRole('button',{name:'Verify',exact:true}).click();
  }
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('Reflect on your recorded training week.')).toBeVisible();
  const theme=email==='one@example.invalid'?'dark':'light';
  await expect(page.locator('.workspace')).toHaveClass(new RegExp('theme-'+theme));
  await page.getByRole('link',{name:'Open Coach'}).click();
  await expect(page.getByRole('heading',{name:'Coach',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Coach settings',exact:true}).click();
  await expect(page.getByLabel('OpenRouter API key')).toBeVisible();
  await expect(page.getByLabel('OpenRouter API key')).toHaveAttribute('type','password');
  await page.screenshot({path:info.outputPath('coach-'+theme+'.png'),animations:'disabled'});
  await page.getByRole('link',{name:'Notifications',exact:true}).first().click();
  await expect(page.getByRole('heading',{name:'Notification preferences'})).toBeVisible();
  await expect(page.getByLabel('Show detailed previews on Web Push devices')).not.toBeChecked();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('notifications-'+theme+'.png'),animations:'disabled'});
  await page.goto('/app/settings');
  await page.getByRole('button',{name:'Sign out'}).click();
  await expect(page).toHaveURL(/\/$/);
});

test('Coach setup collects consent and supports persistent free-text follow-ups',async({page},info)=>{
  await page.goto('/login');
  await page.getByLabel('Email').fill('one@example.invalid');
  await page.getByLabel('Password').fill('synthetic-password');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page).toHaveURL(/\/app$/);
  let personal=false;
  let enabled=false;
  const turns:{id:string;prompt:string;answer:string;created_at:string}[]=[];
  let conversation:{id:string;title:string;updated_at:string}|undefined;
  let interrupted=false;
  let stopped=false;
  const common={provider:'Synthetic host',endpoint:'synthetic',capabilities:['max_tokens'],retention:'zero'};
  const models=[
    {...common,name:'Synthetic Free',model:'synthetic/free',free:true,prompt:0,completion:0},
    {...common,name:'Synthetic Paid',model:'synthetic/paid',free:false,prompt:0.000002,completion:0.000004},
  ];
  await page.route('**/api/coach',async route=>{
    const request=route.request();
    if(request.method()==='GET'){
      await route.fulfill({json:{personal,instance:false,setting:enabled?{
        enabled:true,chatConsent:true,model:models[0].model,credential_source:'personal',monthly_micros:0,
      }:null,history:[],usage:{requests:turns.length,usd:0,tokens:turns.length?400:0}}});
      return;
    }
    const input=request.postDataJSON();
    if(input.action==='discover'){
      expect(input.key).toBe('synthetic-inference-key');
      personal=true;
      await route.fulfill({json:{models}});
    }else if(input.action==='enable'){
      expect(input).toMatchObject({source:'personal',selection:{model:models[0].model},consent:true,chatConsent:true,monthlyUsd:0});
      enabled=true;
      await route.fulfill({json:{saved:true}});
    }else if(input.action==='conversations'){
      await route.fulfill({json:{conversations:conversation?[conversation]:[]}});
    }else if(input.action==='new-chat'){
      conversation={id:input.id,title:'New chat',updated_at:'2026-11-28T12:00:00Z'};
      await route.fulfill({json:{conversation}});
    }else if(input.action==='conversation'){
      await route.fulfill({json:{turns}});
    }else if(input.action==='rename-chat'){
      if(conversation) conversation.title=input.title;
      await route.fulfill({json:{saved:true}});
    }else if(input.action==='delete-chat'){
      conversation=undefined;
      turns.length=0;
      await route.fulfill({json:{saved:true}});
    }else if(input.action==='send'){
      expect(input.id).toBe(conversation?.id);
      expect(input.prompt).toBe(turns.length?'How about last month?':'Compare my current training with my usual schedule.');
      if(turns.length&&!interrupted){
        interrupted=true;
        expect(input.stream).toBe(true);
        await new Promise<void>(resolve=>{
          const poll=setInterval(()=>{if(stopped){clearInterval(poll);resolve();}},20);
          setTimeout(()=>{clearInterval(poll);resolve();},3000);
        });
        await route.abort().catch(()=>undefined);
        return;
      }
      const answer=turns.length?'Your prior month had **eight sessions**.':'You logged **two sessions** this week.';
      const turn={id:input.turn,prompt:input.prompt,answer,created_at:'2026-11-28T12:00:00Z'};
      turns.push(turn);
      if(input.stream) await route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({delta:answer})+'\n'+JSON.stringify({turn})+'\n'});
      else await route.fulfill({json:{turn}});
    }else{
      await route.fulfill({status:400,json:{error:'Unexpected synthetic action'}});
    }
  });
  await page.goto('/app/coach');
  await page.getByRole('button',{name:'Coach settings',exact:true}).click();
  await page.getByLabel('OpenRouter API key').fill('synthetic-inference-key');
  await page.getByRole('button',{name:'Test connection and find models'}).click();
  await expect(page.getByRole('option',{name:/Synthetic Free/})).toHaveText(/Free · Recommended/);
  await expect(page.getByRole('option',{name:/Synthetic Paid/})).toHaveText(/Paid/);
  await expect(page.getByLabel('Replacement key')).toHaveValue('');
  const consent=page.getByRole('checkbox',{name:/logging disabled/});
  await expect(consent).not.toBeChecked();
  await consent.check();
  await page.getByRole('button',{name:'Save and enable Coach'}).click();
  const input=page.getByRole('textbox',{name:'Message Coach'});
  await input.fill('Compare my current training with my usual schedule.');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.locator('.coach-markdown strong')).toHaveText('two sessions');
  await input.fill('How about last month?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(()=>interrupted).toBe(true);
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  stopped=true;
  await expect(page.getByRole('region',{name:'Coach chat'}).getByRole('alert')).toHaveText('Generation stopped.');
  await page.getByRole('button',{name:'Retry reply'}).click();
  await expect(page.locator('.coach-markdown strong').last()).toHaveText('eight sessions');
  await page.getByRole('button',{name:'Rename',exact:true}).click();
  await page.getByRole('textbox',{name:'Conversation title'}).fill('Training review');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('option',{name:'Training review'})).toBeAttached();
  await page.screenshot({path:info.outputPath('coach-conversation.png'),animations:'disabled'});
  await page.reload();
  await page.getByLabel('Conversations').selectOption({label:'Training review'});
  await expect(page.getByText('How about last month?',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Delete',exact:true}).click();
  await page.getByRole('button',{name:'Confirm deletion'}).click();
  await expect(page.getByRole('option',{name:'Training review'})).toHaveCount(0);
});
