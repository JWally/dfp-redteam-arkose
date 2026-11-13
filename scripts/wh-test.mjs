import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync } from 'node:fs';
const PK='2CB16598-CB82-4CF7-B332-5990DB66F3AB';
const Ksrc=readFileSync(new URL('./K.injected.js', import.meta.url),'utf8');
const srv=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><title>ark</title>
<script src="https://client-api.arkoselabs.com/v2/${PK}/api.js" data-callback="setupEnforcement"></script></head>
<body><button id="t">v</button><script>function setupEnforcement(e){window.__enf=e;e.setConfig({selector:'#t'});}</script></body></html>`);});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));const port=srv.address().port;
const b=await chromium.launch({headless:false,channel:'chrome',args:['--disable-blink-features=AutomationControlled']});
const ctx=await b.newContext();
await ctx.addInitScript({content:Ksrc});
await ctx.addInitScript(()=>{const e=TextEncoder.prototype.encode;TextEncoder.prototype.encode=function(i){try{if(typeof i==='string'&&i.startsWith('[{"key":"api_type"')&&!window.__bda)window.__bda=i;}catch{}return e.apply(this,arguments);};});
const p=await ctx.newPage();
await p.goto(`http://127.0.0.1:${port}/`,{waitUntil:'domcontentloaded'});
await p.waitForTimeout(1500);await p.click('#t');
await p.waitForFunction(()=>window.__bda,null,{timeout:20000});
const out=await p.evaluate(()=>{
  const bda=JSON.parse(window.__bda);
  const wh=bda.find(e=>e.key==='wh').value;
  const K=window.__K;
  const keys=Object.keys(window);
  const protoKeys=[];let o=Object.getPrototypeOf(window);
  while(o){protoKeys.push(...Object.keys(o));o=Object.getPrototypeOf(o);}
  const filter=(arr)=>arr.filter(k=>!/^f_/.test(k)&&!/ck$/.test(k));
  const cands={
    'own join|':K(keys.join('|'),420),
    'own sorted join|':K([...keys].sort().join('|'),420),
    'own join;':K(keys.join(';'),420),
    'own filtered':K(filter(keys).join('|'),420),
    'proto join|':K(protoKeys.join('|'),420),
    'proto sorted':K([...protoKeys].sort().join('|'),420),
    'whole join|':K([...keys,...protoKeys].join('|'),420),
    'own join| seeds':[0,1,420].map(s=>K(keys.join('|'),s)).join(' / '),
  };
  return {wh, countKeys:keys.length, countProto:protoKeys.length, cands};
});
console.log('wh =',out.wh);
for(const [k,v] of Object.entries(out.cands)) console.log(k.padEnd(20), v);
console.log('keys',out.countKeys,'proto',out.countProto);
await b.close();srv.close();
