import {test,expect} from '@playwright/test';
test('setup dashboard and keyboard search',async({page},info)=>{
  const exceptions:Error[]=[];
  page.on('pageerror',e=>exceptions.push(e));
  page.on('console',message=>{if(message.type()==='error' && /hydration|content security policy/i.test(message.text())) exceptions.push(new Error(message.text()));});
  const response=await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("'strict-dynamic'");
  await expect(page.getByRole('heading',{name:'Dashboard'})).toBeVisible();
  await expect(page.getByText('No observations in this range')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('dashboard.png'),fullPage:true,caret:'initial'});
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('textbox',{name:'Find a page'}).fill('muscle');
  await page.getByRole('dialog').getByRole('link',{name:'Muscle analytics'}).click();
  await expect(page.getByRole('heading',{name:'Full body overview'})).toBeVisible();
  await page.getByRole('link',{name:'Chest 0 direct · 0 secondary',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Chest',exact:true})).toBeVisible();
  expect(exceptions).toEqual([]);
});
test('unconfigured private workspace renders no account data',async({page})=>{
  await page.goto('/app/workouts');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading',{name:'Dashboard'})).toBeVisible();
});
