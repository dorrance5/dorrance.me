// Run with NODE_PATH pointing to Playwright. Uses only fictional cars and an in-memory API.
const { webkit, devices } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const X = require('./rtexport.cjs'), fixture = require('./fixture.json');
const root = path.resolve(__dirname, '../..');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
let bump = false, api;
const server = http.createServer(async (req,res)=>{
 if(req.url.startsWith("/api/")){
  if(api.gh.offline){req.socket.destroy();return;}
  const chunks=[]; for await(const chunk of req) chunks.push(chunk);
  const response=await api.call("http://x"+req.url,{method:req.method,headers:req.headers,body:req.method==='GET'?undefined:Buffer.concat(chunks)});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 let p = new URL(req.url,'http://x').pathname;
 if(p.endsWith('/')) p += 'index.html';
 const file = path.join(root,p);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 let body=fs.readFileSync(file);
 if(bump&&p==='/roadtrip/sw.js') body=Buffer.from(body.toString().replace(/const CACHE = '[^']+'/,"const CACHE = 'roadtrip-v999'"));
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
});
(async()=>{
 api=await require('../../worker/test/harness.cjs')('{"recipes":[]}');
 const login=await api.call('http://x/api/auth/login',{method:'POST',body:JSON.stringify({name:'Mitchell',password:api.ADMIN_PASSWORD})});
 const {token,name,admin}=await login.json();
 const auth={token,name,admin};
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/roadtrip/`;
 const browser=await webkit.launch();
 try {
 const ctx=await browser.newContext({...devices['iPhone 13']});
 await ctx.addInitScript(s=>{if(!sessionStorage.seeded){localStorage.setItem('dorrance-session',JSON.stringify(s));sessionStorage.seeded='1';}},auth);
 const p=await ctx.newPage(), errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 p.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400) console.log('API error',r.status(),r.url());});
 p.on('requestfailed',r=>console.log('request failed',r.url(),r.failure()));
 await p.clock.setFixedTime(new Date(2026,9,31,15,44));
 await p.goto(base); await p.waitForSelector('#v-empty:not([hidden]) [data-act="import"]');
 const upload={name:'Road Trip CSV.zip',mimeType:'application/zip',buffer:X.zip(fixture.cars.map(c=>({name:c.name+'.csv',text:X.csv(c)})))};
 await p.setInputFiles('#importFile',upload); await p.waitForSelector('#impGo');
 assert.equal(await p.locator('.sheet [data-i]').count(),fixture.cars.length);
 await p.click('#impGo');
 await p.waitForFunction(()=>JSON.parse(localStorage.roadtrip).queue.length===0).catch(async e=>{console.log(await p.locator('#syncNote').textContent(),await p.evaluate(()=>JSON.parse(localStorage.roadtrip).queue.length));throw e;});
 assert.equal((await api.kv.get('road:home:solo.mitchell.admin','json')).cars.length,fixture.cars.length);
 await p.setInputFiles('#importFile',upload); await p.click('#impGo');
 assert.equal((await api.kv.get('road:home:solo.mitchell.admin','json')).cars.length,fixture.cars.length);
 console.log('ok ZIP import, save and repeat import');
 await p.click('#addBtn'); await p.fill('#fOdo','200000');
 await p.locator('#fGal').pressSequentially('9412'); await p.locator('#fPrice').pressSequentially('3899');
 assert.equal(await p.inputValue('#fGal'),'9.412'); assert.equal(await p.inputValue('#fPrice'),'3.899'); assert.equal(await p.inputValue('#fTotal'),'36.70');
 await p.click('#fSave'); await p.waitForFunction(()=>JSON.parse(localStorage.roadtrip).queue.length===0);
 const saved=await p.evaluate(()=>JSON.parse(localStorage.roadtrip).state.cars.flatMap(c=>c.fuel).find(f=>f.odo===200000));
 assert.equal(saved.total,36.7);
 await p.click('[data-tab="fuel"]'); await p.locator('#v-fuel .row').first().click();
 await p.click('#fillLayer [data-edit]'); await p.click('.sheet [data-del]');
 await p.waitForFunction(id=>JSON.parse(localStorage.roadtrip).queue.length===0&&JSON.parse(localStorage.roadtrip).state.cars.some(c=>c.fuel.some(f=>f.id===id&&f.gone)),saved.id);
 await p.click('[data-tab="more"]'); await p.click('#v-more [data-act="archived"]');
 await p.locator(`[data-back$=":${saved.id}"]`).click();
 await p.waitForFunction(id=>JSON.parse(localStorage.roadtrip).queue.length===0&&JSON.parse(localStorage.roadtrip).state.cars.some(c=>c.fuel.some(f=>f.id===id&&!f.gone)),saved.id);
 console.log('ok automatic decimal, fuel save, archive and restore');
 await p.reload(); await p.evaluate(()=>navigator.serviceWorker.ready); await p.reload();
 // iPhone Duo: closed upright and sideways, open upright and sideways, and half the open screen. Only open sideways
 // moves the tab bar to a rail on the right and puts Stats and Expenses in two columns.
 const box=sel=>p.$eval(sel,el=>{const r=el.getBoundingClientRect();return{l:r.left,r:r.right,t:r.top,b:r.bottom};});
 for(const [width,height] of [[382,580],[594,368],[669,867],[951,585],[385,867]]){
  await p.setViewportSize({width,height});
  const wide=width===951;
  for(const tab of ['stats','fuel','costs','more']){
   await p.click(`[data-tab="${tab}"]`);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} ${tab}: horizontal overflow`);
   assert.ok(await p.locator(`#v-${tab}`).isVisible());
   const bar=await box('#tabbar'),view=await box(`#v-${tab}`);
   assert.ok(wide?bar.l>=view.r&&bar.r<=width+0.5:bar.t>=view.t&&bar.b<=height+0.5,`${width}×${height} ${tab}: tab bar ${wide?'on the right':'at the bottom'}`);
  }
  await p.click('[data-tab="stats"]');
  const chart=await box('#v-stats .chart'),hero=await box('#v-stats .hero');
  assert.ok(wide?hero.l>=chart.r:hero.t>=chart.b,`${width}×${height}: stats ${wide?'in two columns':'in one column'}`);
  await p.click('[data-tab="costs"]');
  const rem=await box('#v-costs .sec'),list=await box('#v-costs .rows');
  assert.ok(wide?list.l>=rem.r:list.t>=rem.b,`${width}×${height}: expenses ${wide?'in two columns':'in one column'}`);
 }
 console.log('ok five Duo sizes, all tabs; a rail on the right only when open sideways');
 await p.click('[data-tab="stats"]');
 api.gh.offline=true; await ctx.setOffline(true); await p.reload(); await p.waitForSelector('#v-stats:not([hidden])');
 await p.click('#addBtn'); await p.fill('#fOdo','200100'); await p.locator('#fGal').pressSequentially('5000'); await p.locator('#fPrice').pressSequentially('3000'); await p.click('#fSave');
 assert.ok(await p.evaluate(()=>JSON.parse(localStorage.roadtrip).queue.length>0));
 await p.reload(); assert.ok(await p.evaluate(()=>JSON.parse(localStorage.roadtrip).queue.length>0));
 api.gh.offline=false; await ctx.setOffline(false); await p.evaluate(()=>dispatchEvent(new Event('online')));
 await p.waitForFunction(()=>JSON.parse(localStorage.roadtrip).queue.length===0);
 console.log('ok offline reload, queued edit and reconnect');
 bump=true; await p.evaluate(()=>navigator.serviceWorker.getRegistration().then(r=>r.update()));
 await p.waitForSelector('.toast.tap.on'); assert.equal(await p.locator('.toast.tap.on').textContent(),'Updated · Tap to reload');
 await Promise.all([p.waitForEvent('load'),p.click('.toast.tap.on')]);
 assert.ok((await p.evaluate(()=>caches.keys())).includes('roadtrip-v999'));
 assert.deepEqual(errors,[]);
 console.log('ok update notice and reload; no page errors');
 await ctx.close();
 } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
