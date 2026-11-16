import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.locator('#options').click();
  for(const [key,value]of [['renderDistance','2'],['fov','90'],['sensitivity','1.4'],['volume','0.3'],['ambient','0.1']])await page.locator(`[data-setting="${key}"]`).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))},value);
  await page.locator('[data-setting="quality"]').selectOption('low');await page.locator('[data-setting="shadows"]').check();
  const live=await page.evaluate(()=>{const g=window.blockcraft;return{fov:g.camera.fov,ratio:g.renderer.getPixelRatio(),shadows:g.renderer.shadowMap.enabled,shadowScale:g.sunLight.shadow.camera.projectionMatrix.elements[0],volume:g.audio.volume,sensitivity:g.settings.sensitivity}});
  assert.deepEqual(live,{fov:90,ratio:1,shadows:true,shadowScale:.025,volume:.3,sensitivity:1.4});
  await page.locator('#controls').click();await page.getByRole('heading',{name:'Controles',exact:true}).waitFor();await page.locator('#back').click();await page.locator('#back').click();
  await page.reload();await page.locator('#options').click();assert.equal(await page.locator('[data-setting="fov"]').inputValue(),'90');assert.equal(await page.locator('[data-setting="shadows"]').isChecked(),true);await page.locator('#back').click();
  await page.locator('#single').click();await page.locator('#create').click();await page.locator('#world-mode').selectOption('creative');await page.locator('#create-play').click();await page.waitForFunction(()=>window.blockcraft.state==='playing');await page.waitForFunction(()=>window.blockcraft.world.chunks.size===25);
  await page.keyboard.press('KeyE');await page.locator('[data-area="inv"][data-index="0"]').dragTo(page.locator('[data-area="inv"][data-index="12"]'));
  assert.deepEqual(await page.evaluate(()=>{const g=window.blockcraft;return [g.inventory.slots[0],g.inventory.slots[12],g.ui.carried]}),[null,{id:'grass',count:64},null]);
  await page.locator('#close-inventory').click();await page.waitForFunction(()=>window.blockcraft.state==='playing');
  await page.screenshot({path:'artifacts/shadows.png'});assert.deepEqual(errors,[]);await writeFile('artifacts/browser-options.json',JSON.stringify({success:true,live,chunks:25,settingsPersisted:true,dragAndDrop:true,errors},null,2));console.log('PASS live FOV, resolution, shadows, shadow projection, sound, sensitivity, controls navigation, persisted settings, real chunk radius, and native inventory drag/drop.');
}finally{await browser.close()}
