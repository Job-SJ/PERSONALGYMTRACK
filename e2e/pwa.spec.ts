import {expect,test} from '@playwright/test';

test('PWA assets are served and privileged registration stays closed by default',async({request})=>{
  const manifest=await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  const {icons,display}=await manifest.json();
  expect(display).toBe('standalone');
  for(const icon of icons){
    const response=await request.get(icon.src);
    expect(response.headers()['content-type']).toContain('image/png');
  }
  expect((await request.get('/sw.js')).headers()['cache-control']).toContain('no-store');
  expect((await request.get('/register')).url()).toMatch(/\/login$/);
  expect(await (await request.get('/api/health')).json()).toEqual({status:'ok'});
});

test('production service worker shows a generic offline page',async({page,context})=>{
  test.skip(process.env.PGT_E2E_PRODUCTION!=='1','The app registers a service worker only in production.');
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'You are offline'})).toBeVisible();
});
