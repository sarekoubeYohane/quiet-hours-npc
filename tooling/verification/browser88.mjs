import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {url, server} from './browser-fixture.mjs';
import {launchBrowser, outputPath} from './browser-runtime.mjs';

let browser;
try {
 browser = await launchBrowser();
 const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 const fontCSS=process.env.BROWSER_FONT_DIR?(await readFile(join(process.env.BROWSER_FONT_DIR,'index.css'),'utf8')).replaceAll('./files/','/__font/'):'';
 const readableFonts=async()=>{if(fontCSS)await page.addStyleTag({content:fontCSS+'\nbody{font-family:"Noto Sans TC",sans-serif}'});await page.evaluate(()=>document.fonts.ready);};
 const before=(await(await page.request.get(url+'/api/world')).json()).world;
 const response=await page.request.get(url+'/characters/manifest.json');
 assert.equal(response.status(),200);
 const {characters}=await response.json();
 assert.deepEqual(Object.keys(characters).sort(),['cass','kris','owner','vera']);
 await page.goto(url+'/characters/preview.html');
 await page.waitForFunction(()=>document.querySelectorAll('article img').length===20 && [...document.images].every(img=>img.complete&&img.naturalWidth>0));
 await readableFonts();
 for(const [id,assets] of Object.entries(characters)){
  for(const kind of ['master','portrait','avatar','pixel']){
   const spec=assets[kind];
   const actual=await page.evaluate(async src=>{const img=new Image();img.src=src;await img.decode();return [img.naturalWidth,img.naturalHeight];},spec.src);
   assert.deepEqual(actual,[spec.width,spec.height],`${id} ${kind}`);
  }
  const alpha=await page.evaluate(async src=>{
   const img=new Image();img.src=src;await img.decode();
   const c=document.createElement('canvas');c.width=48;c.height=96;
   const context=c.getContext('2d');context.drawImage(img,0,0);
   const data=context.getImageData(0,0,48,96).data;
   const values=new Set();let minX=48,maxX=-1,minY=96,maxY=-1;
   for(let y=0;y<96;y++)for(let x=0;x<48;x++){const a=data[(y*48+x)*4+3];values.add(a);if(a){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
   return {values:[...values].sort((a,b)=>a-b),minX,maxX,minY,maxY};
  },assets.pixel.src);
  assert.deepEqual(alpha.values,[0,255],`${id} binary transparent edges`);
  assert.ok(alpha.minX>0&&alpha.maxX<47&&alpha.minY>0,`${id} clear padding`);
  assert.equal(alpha.maxY,91,`${id} foot baseline`);
  console.log('PASS',id,'all four image uses decode, dimensions, binary alpha, padding and baseline',alpha);
 }
 await page.screenshot({path:outputPath('approved-lineup.jpg'),type:'jpeg',quality:88,fullPage:true});
 await page.goto(url);await page.getByRole('button',{name:'下一回合',exact:true}).waitFor();
 await readableFonts();
 await page.waitForFunction(()=>[...document.querySelectorAll('.map-character img')].length===4&&[...document.querySelectorAll('.map-character img')].every(img=>img.complete&&img.naturalWidth===48));
 for(const img of await page.locator('.map-character img').all())assert.equal(await img.evaluate(el=>getComputedStyle(el).imageRendering),'pixelated');
 await page.locator('.pixel-scene').screenshot({path:outputPath('map-desktop.jpg'),type:'jpeg',quality:90});
 const panel=page.getByRole('region',{name:'角色近況',exact:true});
 const profile=page.getByRole('region',{name:'人物檔案',exact:true});
 for(const [id,name] of [['cass','Cass'],['vera','Vera'],['kris','Kris'],['owner','店主']]){
  await panel.getByRole('button',{name,exact:true}).click();
  await panel.getByRole('button',{name:'人物檔案',exact:true}).click();
  const art=profile.getByRole('img',{name:`${name} 的人物圖`,exact:true});
  await art.evaluate(img=>img.decode());
  assert.equal(await art.getAttribute('src'),characters[id].portrait.src);
  assert.equal(await art.evaluate(img=>img.naturalWidth),768);
  assert.equal(await art.evaluate(img=>getComputedStyle(img).imageRendering),'auto');
  assert.equal(await art.evaluate(img=>getComputedStyle(img).height),'400px');
  await profile.screenshot({path:outputPath(`profile-${id}.jpg`),type:'jpeg',quality:88});
  await profile.getByRole('button',{name:'返回觀察',exact:true}).click();
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('.pixel-scene').screenshot({path:outputPath('map-narrow.jpg'),type:'jpeg',quality:90});
 await panel.getByRole('button',{name:'Vera',exact:true}).click();
 await panel.getByRole('button',{name:'人物檔案',exact:true}).click();
 assert.equal(await profile.getByRole('img',{name:'Vera 的人物圖',exact:true}).evaluate(img=>getComputedStyle(img).height),'300px');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await profile.screenshot({path:outputPath('profile-narrow.jpg'),type:'jpeg',quality:88});
 const after=(await(await page.request.get(url+'/api/world')).json()).world;
 assert.deepEqual(after,before,'viewing assets never changes saved world');
 assert.deepEqual(errors,[]);
 console.log('PASS #88 real WorldApp: all four profiles, desktop/narrow map, nearest-neighbour sprites, smooth portraits, no broken images or world changes');
} finally {await browser?.close();server.close();}
