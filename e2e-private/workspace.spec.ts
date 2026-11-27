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
  await expect(page.getByRole('heading',{name:'Your coach. Your journey.'})).toBeVisible();
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

test('Coach setup collects consent and shows a budgeted reply',async({page},info)=>{
  await page.goto('/login');
  await page.getByLabel('Email').fill('one@example.invalid');
  await page.getByLabel('Password').fill('synthetic-password');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page).toHaveURL(/\/app$/);
  let personal=false;
  let enabled=false;
  const history:{id:string;topic:string;answer:string;created_at:string}[]=[];
  const common={provider:'Synthetic host',endpoint:'synthetic',capabilities:['max_tokens'],retention:'zero'};
  const models=[
    {...common,name:'Synthetic Free',model:'synthetic/free',free:true,prompt:0,completion:0},
    {...common,name:'Synthetic Paid',model:'synthetic/paid',free:false,prompt:0.000002,completion:0.000004},
  ];
  await page.route('**/api/coach',async route=>{
    const request=route.request();
    if(request.method()==='GET'){
      await route.fulfill({json:{personal,instance:false,setting:enabled?{
        enabled:true,model:models[0].model,credential_source:'personal',monthly_micros:0,
      }:null,history,usage:{requests:history.length,usd:0,tokens:history.length?400:0}}});
      return;
    }
    const input=request.postDataJSON();
    if(input.action==='discover'){
      expect(input.key).toBe('synthetic-inference-key');
      personal=true;
      await route.fulfill({json:{models}});
    }else if(input.action==='enable'){
      expect(input).toMatchObject({source:'personal',selection:{model:models[0].model},consent:true,monthlyUsd:0});
      enabled=true;
      await route.fulfill({json:{saved:true}});
    }else if(input.action==='ask'){
      expect(input).toEqual({action:'ask',topic:'week'});
      const reply={id:'synthetic-reply',topic:'week',created_at:'2025-01-01T12:00:00Z',
        answer:'Observations\nYour synthetic training log has two sessions this week.\n\nEstimates\nMore comparable lifts are needed for a trend.\n\nSuggestions\nReview your working sets before your next session.'};
      history.unshift(reply);
      await route.fulfill({json:reply});
    }else{
      await route.fulfill({status:400,json:{error:'Unexpected synthetic action'}});
    }
  });
  await page.goto('/app/coach');
  await page.getByLabel('OpenRouter API key').fill('synthetic-inference-key');
  await page.getByRole('button',{name:'Test connection and find models'}).click();
  await expect(page.getByRole('option',{name:/Synthetic Free/})).toHaveText(/Free · Recommended/);
  await expect(page.getByRole('option',{name:/Synthetic Paid/})).toHaveText(/Paid/);
  await expect(page.getByLabel('Replacement key')).toHaveValue('');
  const consent=page.getByRole('checkbox',{name:/logging disabled/});
  await expect(consent).not.toBeChecked();
  await consent.check();
  await page.getByRole('button',{name:'Save and enable Coach'}).click();
  await page.getByRole('button',{name:'Summarize my training week.'}).click();
  await expect(page.getByText(/synthetic training log has two sessions/)).toBeVisible();
  await expect(page.getByText(/400 tokens/)).toBeVisible();
  await page.screenshot({path:info.outputPath('coach-conversation.png'),animations:'disabled'});
});
