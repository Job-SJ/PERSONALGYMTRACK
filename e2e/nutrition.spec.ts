import {expect,test} from '@playwright/test';

test('nutrition is reachable and responsive in setup mode',async({page},info)=>{
  await page.goto('/');
  await page.getByRole('link',{name:'Nutrition',exact:true}).filter({visible:true}).click();
  await expect(page).toHaveURL('/app/nutrition');
  expect(await page.evaluate(async()=> (await fetch('/app/nutrition')).headers.get('permissions-policy'))).toContain('camera=(self)');
  await expect(page.getByRole('heading',{name:'Nutrition',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Nutrition',exact:true}).filter({visible:true})).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('button',{name:'Log food'})).toBeDisabled();
  const date=page.getByLabel('Diary date');
  const today=await date.inputValue();
  await page.getByRole('button',{name:'Previous day'}).click();
  await expect(date).not.toHaveValue(today);
  await page.getByRole('button',{name:'Today',exact:true}).click();
  await expect(date).toHaveValue(today);
  await page.getByRole('button',{name:'Trends',exact:true}).click();
  await page.getByLabel('Trend',{exact:true}).selectOption('strength');
  await expect(page.getByRole('option',{name:'No eligible strength sessions'})).toBeAttached();
  await page.getByRole('button',{name:'Diary',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('nutrition-dark.png'),fullPage:true,animations:'disabled'});
  await page.locator('.workspace').evaluate(node=>node.classList.replace('theme-dark','theme-light'));
  await expect(page.locator('.workspace')).toHaveCSS('background-color','rgb(242, 245, 247)');
  await page.screenshot({path:info.outputPath('nutrition-light.png'),fullPage:true,animations:'disabled'});
});
