#!/usr/bin/env node
import { chromium } from 'playwright';
import http from 'node:http';
const PK='2CB16598-CB82-4CF7-B332-5990DB66F3AB';
const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end(`<!doctype html><html><head><title>ark</title>
<script src="https://client-api.arkoselabs.com/v2/${PK}/api.js" data-callback="setupEnforcement"></script></head>
<body><button id="t">v</button><script>function setupEnforcement(e){window.__enf=e;e.setConfig({selector:'#t'});}</script></body></html>`);});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));const port=srv.address().port;
const CAP=()=>{const e=TextEncoder.prototype.encode;TextEncoder.prototype.encode=function(i){try{if(typeof i==='string'&&i.startsWith('[{"key":"api_type"')&&!window.__bda)window.__bda=i;}catch{}return e.apply(this,arguments);};};
const b=await chromium.launch({headless:false,channel:'chrome',args:['--disable-blink-features=AutomationControlled']});
async function grab(ctx,label){
  const p=await ctx.newPage();
  await p.goto(`http://127.0.0.1:${port}/`,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1500);try{await p.click('#t');}catch{}
  await p.waitForFunction(()=>window.__bda,null,{timeout:20000});
  const bda=JSON.parse(await p.evaluate(()=>window.__bda));
  const fp=bda.find(e=>e.key==='enhanced_fp').value;const g=k=>fp.find(e=>e.key===k)?.value;
  const ls=await p.evaluate(()=>{try{return JSON.stringify(Object.fromEntries(Object.entries(localStorage)))}catch(e){return 'ERR'}});
  const out={label,lfasdgs:g('lfasdgs'),id6a:g('6a62b2a558'),ls};
  await p.close();return out;
}
const c1=await b.newContext();await c1.addInitScript(CAP);
const c2=await b.newContext();await c2.addInitScript(CAP);
const c3=await b.newContext();await c3.addInitScript(CAP);
// c3: block localStorage entirely before load
await c3.addInitScript(()=>{try{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')},configurable:true});}catch(e){}});
console.log(JSON.stringify(await grab(c1,'ctx1')));
console.log(JSON.stringify(await grab(c1,'ctx1-reload')));
console.log(JSON.stringify(await grab(c2,'ctx2-fresh-profile')));
console.log(JSON.stringify(await grab(c3,'ctx3-no-localStorage')));
await b.close();srv.close();
