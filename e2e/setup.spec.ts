import {test,expect} from '@playwright/test';
test('setup dashboard and keyboard search',async({page},info)=>{
  const exceptions:Error[]=[];
  page.on('pageerror',e=>exceptions.push(e));
  page.on('console',message=>{if(message.type()==='error' && /hydration|content security policy/i.test(message.text())) exceptions.push(new Error(message.text()));});
  const response=await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("'strict-dynamic'");
  await expect(page.getByRole('heading',{name:'Build your training baseline.'})).toBeVisible();
  await expect(page.getByText('No observations in this range')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('dashboard.png'),fullPage:true,caret:'initial'});
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('textbox',{name:'Find a page'}).fill('muscle');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('dialog').getByRole('link',{name:'Muscle analytics'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Full body overview'})).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link',{name:'Dashboard'}).first()).not.toHaveAttribute('aria-current','page');
  await expect(page.getByRole('navigation').getByRole('link',{name:'Muscle analytics'}).first()).toHaveAttribute('aria-current','page');
  await page.getByRole('link',{name:'Chest 0 direct · 0 secondary',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Chest',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Weekly training'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Exercise progression'})).toBeVisible();
  await page.getByRole('link',{name:'30D',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Chest',exact:true})).toBeVisible();
  expect(exceptions).toEqual([]);
});
test('unconfigured private workspace renders no account data',async({page})=>{
  await page.goto('/app/workouts');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading',{name:'Build your training baseline.'})).toBeVisible();
});

test('daily intelligence keeps its period distinct from the dashboard chart range',async({page})=>{
  await page.goto('/?days=365');
  const period=page.getByRole('navigation',{name:'Intelligence period'});
  await expect(period.getByRole('link',{name:'30 days'})).toHaveAttribute('aria-current','true');
  await period.getByRole('link',{name:'7 days'}).click();
  await expect(period.getByRole('link',{name:'7 days'})).toHaveAttribute('aria-current','true');
  await expect(page).toHaveURL(/intelligence=7.*days=365/);
  await expect(page.getByText('0 / 7 days')).toBeVisible();
  await expect(page.getByRole('list',{name:'Training insights'})).toHaveCount(0);
  await page.getByText('How it’s calculated').click();
  await expect(page.getByText(/Each period uses completed days/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('athlete experiences are discoverable from Daily Intelligence and handle empty data',async({page})=>{
  await page.goto('/');
  await page.getByRole('link',{name:'Explore training history'}).click();
  const nav=page.getByRole('navigation',{name:'Training experiences'});
  await expect(nav.getByRole('link',{name:'Performance Replay'})).toHaveAttribute('aria-current','page');
  await expect(page.getByText('Import workouts to explore your recorded training history.')).toBeVisible();
  await nav.getByRole('link',{name:'Strength Passport'}).click();
  await expect(page.getByRole('heading',{name:'Your strength. Your story.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Review PNG export'})).toHaveCount(0);
  await nav.getByRole('link',{name:'Training Fingerprint'}).click();
  await expect(page.getByText(/at least four distinct dates/)).toBeVisible();
  await page.getByRole('navigation',{name:'Fingerprint period'}).getByRole('link',{name:'56 days'}).click();
  await expect(page.getByRole('link',{name:'56 days'})).toHaveAttribute('aria-current','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('unauthenticated export redirects with private response headers',async({request})=>{
  const response=await request.get('/app/export',{maxRedirects:0});
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/');
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(response.headers()['content-disposition']).toBeUndefined();
});

test('calendar switches periods, views and weekday order without page overflow',async({page},info)=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/?tab=calendar');
  await expect(page.locator('.mobile-nav a[title="Workout history"]')).toHaveAttribute('aria-current','location');
  await page.screenshot({path:info.outputPath('calendar-dark.png')});
  await page.locator('.workspace').evaluate(node=>{node.classList.replace('theme-dark','theme-light');});
  await expect(page.locator('.workspace')).toHaveCSS('background-color','rgb(242, 245, 247)');
  await page.screenshot({path:info.outputPath('calendar-light.png')});
  const today=page.locator('.calendar-grid [aria-current=date]:not([data-outside])');
  await expect(today).toBeVisible();
  await expect(today).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Previous period'}).click();
  await expect(today).toHaveCount(0);
  await page.getByRole('button',{name:'Today',exact:true}).click();
  await expect(today).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Week',exact:true}).click();
  await expect(page.locator('.calendar-day')).toHaveCount(7);
  await page.getByRole('checkbox',{name:'Monday first'}).uncheck();
  await expect(page.locator('.calendar-grid > small').first()).toHaveText('Sun');
  await page.getByRole('button',{name:'Year',exact:true}).click();
  await page.getByLabel('Heatmap metric').selectOption('sets');
  await expect(page.getByText('Working sets per day', {exact:false})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('dashboard links to the calendar and training analytics uses the metric picker',async({page})=>{
  await page.goto('/');
  await page.getByRole('link',{name:'Open training calendar'}).click();
  await expect(page.getByRole('heading',{name:'Training calendar'})).toBeVisible();
  await expect(page.getByRole('group',{name:'Calendar view'})).toBeVisible();

  await page.goto('/?tab=analytics');
  await expect(page.getByRole('heading',{name:'Training analytics'})).toBeVisible();
  const metric=page.getByLabel('Chart metric');
  await metric.selectOption('weight');
  await expect(metric).toHaveValue('weight');
  await expect(page.getByText('No observations in this range')).toBeVisible();
});
