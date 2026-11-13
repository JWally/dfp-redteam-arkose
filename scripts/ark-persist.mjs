#!/usr/bin/env node
/** ark-persist.mjs — are any BDA identifiers stable across reloads / new tabs? */
import { chromium } from 'playwright';
import http from 'node:http';
const PK='2CB16598-CB82-4CF7-B332-5990DB66F3AB';
const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end(`<!doctype html><html><head><title>ark</title>
<script src="https://client-api.arkoselabs.com/v2/${PK}/api.js" data-callback="setupEnforcement"></script></head>
<body><button id="t">v</button><script>function setupEnforcement(e){window.__enf=e;e.setConfig({selector:'#t'});}</script></body></html>`);});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));const port=srv.address().port;
const CAP=()=>{const e=TextEncoder.prototype.encode;TextEncoder.prototype.encode=function(i){try{if(typeof i==='string'&&i.startsWith('[{"key":"api_type"')&&!window.__bda)window.__bda=i;}catch{}return e.apply(this,arguments);};};
const b=await chromium.launch({headless:false,channel:'chrome',args:['--disable-blink-features=AutomationControlled']});
const ctx=await b.newContext();await ctx.addInitScript(CAP);
async function grab(page){
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1500);try{await page.click('#t');}catch{}
  await page.waitForFunction(()=>window.__bda,null,{timeout:20000});
  const t=await page.evaluate(()=>window.__bda);const bda=JSON.parse(t);
  const fp=bda.find(e=>e.key==='enhanced_fp').value;const g=k=>fp.find(e=>e.key===k)?.value;
  return {session:g('4b4b269e68'),lfasdgs:g('lfasdgs'),id6a:g('6a62b2a558'),h83:g('83eb055'),h05:g('05d3d24'),h29:g('29s83ih9'),hc84:g('c8480e29a')};
}
const p1=await ctx.newPage(); const a=await grab(p1);
await p1.reload({waitUntil:'domcontentloaded'}); await p1.waitForTimeout(1200); await p1.click('#t').catch(()=>{}); await p1.waitForFunction(()=>window.__bda&&true,null,{timeout:5000}).catch(()=>{});
const p2=await ctx.newPage(); const c=await grab(p2);
const p3=await ctx.newPage(); const d=await grab(p3);
console.log('same page :',JSON.stringify(a));
console.log('new tab 1 :',JSON.stringify(c));
console.log('new tab 2 :',JSON.stringify(d));
await b.close();srv.close();
