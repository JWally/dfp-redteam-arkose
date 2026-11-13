#!/usr/bin/env node
/** ark-diff2.mjs — second perturbation batch + cross-origin iframe ancestry. */
import { chromium } from 'playwright';
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';

const PK = process.argv[2] || '2CB16598-CB82-4CF7-B332-5990DB66F3AB';
const OUT = '/tmp/opencode/arkose/diff2';
mkdirSync(OUT, { recursive: true });

const srv = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  if (req.url.startsWith('/inner') || req.url === '/') {
    res.end(`<!doctype html><html><head><title>inner</title>
<script src="https://client-api.arkoselabs.com/v2/${PK}/api.js" data-callback="setupEnforcement"></script>
</head><body><button id="t">verify</button>
<script>function setupEnforcement(e){window.__enf=e;e.setConfig({selector:'#t'});}</script>
</body></html>`);
    return;
  }
  if (req.url.startsWith('/host')) {
    const inner = `http://localhost:${srv.address().port}/inner`;
    res.end(`<!doctype html><html><head><title>host</title></head><body>
<iframe id="f" src="${inner}" width="900" height="700"></iframe></body></html>`);
    return;
  }
  res.end('<!doctype html><html><body>top</body></html>');
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const CAPTURE = () => {
  const enc = TextEncoder.prototype.encode;
  TextEncoder.prototype.encode = function (input) {
    try {
      if (typeof input === 'string' && input.startsWith('[{"key":"api_type"') && !window.__bda) window.__bda = input;
    } catch {}
    return enc.apply(this, arguments);
  };
};

const variants = [
  ['baseline', ''],
  ['dpr=2', `Object.defineProperty(window,'devicePixelRatio',{get:()=>2,configurable:true});`],
  ['plugins=[]', `Object.defineProperty(Navigator.prototype,'plugins',{get:()=>({length:0}),configurable:true});Object.defineProperty(Navigator.prototype,'mimeTypes',{get:()=>({length:0}),configurable:true});`],
  ['pdfViewerEnabled=false', `Object.defineProperty(Navigator.prototype,'pdfViewerEnabled',{get:()=>false,configurable:true});`],
  ['timezone=Asia/Tokyo', `const ro=Intl.DateTimeFormat.prototype.resolvedOptions;Intl.DateTimeFormat.prototype.resolvedOptions=function(){const o=ro.apply(this,arguments);o.timeZone='Asia/Tokyo';return o;};Date.prototype.getTimezoneOffset=function(){return -540;};`],
  ['hasFocus=false', `Document.prototype.hasFocus=function(){return false;};`],
  ['webgl.debugExt=null', `for(const C of ['WebGLRenderingContext','WebGL2RenderingContext']){const P=window[C]&&C.prototype;if(P)IExt(P);}
    function IExt(P){const g=P.getExtension;P.getExtension=function(n){if(String(n)==='WEBGL_debug_renderer_info')return null;return g.apply(this,arguments);};}`],
  ['localStorage=throw', `try{Object.defineProperty(window,'localStorage',{get(){throw new Error('denied');},configurable:true});}catch(e){}`],
  ['indexedDB=throw', `try{Object.defineProperty(window,'indexedDB',{get(){throw new Error('denied');},configurable:true});}catch(e){}`],
  ['performance.memory', `try{Object.defineProperty(performance,'memory',{get:()=>({jsHeapSizeLimit:1,usedJSHeapSize:2,totalJSHeapSize:3}),configurable:true});}catch(e){}`],
  ['notification=denied', `try{Object.defineProperty(Notification,'permission',{get:()=>'denied',configurable:true});}catch(e){}`],
  ['standalone=true', `try{Object.defineProperty(Navigator.prototype,'standalone',{get:()=>true,configurable:true});}catch(e){}`],
  ['RTCPeerConnection=none', `try{delete window.RTCPeerConnection;}catch(e){}`],
  ['WebAssembly=none', `try{delete window.WebAssembly;}catch(e){}`],
  ['window.name=abc', `window.name='abc';`],
  ['screen.availTop/Left=100', `Object.defineProperty(Screen.prototype,'availTop',{get:()=>100,configurable:true});Object.defineProperty(Screen.prototype,'availLeft',{get:()=>100,configurable:true});`],
  ['screenX/Y=50', `Object.defineProperty(window,'screenX',{get:()=>50,configurable:true});Object.defineProperty(window,'screenY',{get:()=>60,configurable:true});`],
  ['deviceorientation=none', `try{window.DeviceOrientationEvent=undefined;}catch(e){}`],
];

const b = await chromium.launch({ headless: false, channel: 'chrome', args: ['--disable-blink-features=AutomationControlled'] });
const results = {};

async function runVariant(name, patch, urlPath, framePicker) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(CAPTURE);
  if (patch) await ctx.addInitScript({ content: patch });
  const page = await ctx.newPage();
  let text = null;
  try {
    await page.goto(`http://127.0.0.1:${port}${urlPath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const frame = framePicker(page);
    try { await frame.click('#t'); } catch {}
    await frame.waitForFunction(() => window.__bda, null, { timeout: 20000 });
    text = await frame.evaluate(() => window.__bda);
  } catch (e) {
    console.error(`[${name}] failed: ${e.message.split('\n')[0]}`);
  }
  results[name] = text ? JSON.parse(text) : null;
  await ctx.close();
  console.log(`[${name}] ${text ? 'ok' : 'MISSING'}`);
}

for (const [name, patch] of variants) await runVariant(name, patch, '/', (p) => p.mainFrame());
await runVariant('iframe:cross-origin', '', '/host', (p) => p.frames().find((f) => f.url().includes('/inner')) || p.mainFrame());

await b.close();
srv.close();

const flatten = (bda) => {
  const o = {};
  if (!bda) return o;
  for (const e of bda) {
    if (e.key === 'enhanced_fp') for (const f of e.value) o[`enhanced_fp.${f.key}`] = JSON.stringify(f.value);
    else if (e.key === 'fe') for (const s of e.value) { const i = s.indexOf(':'); o[`fe.${s.slice(0, i)}`] = s.slice(i + 1); }
    else o[e.key] = JSON.stringify(e.value);
  }
  return o;
};

const NOISE = new Set(['n', 'enhanced_fp.4b4b269e68', 'enhanced_fp.navigator_connection_downlink', 'enhanced_fp.4ca87df3d1', 'enhanced_fp.7541c2s']);
const base = flatten(results.baseline);
const out = { pk: PK, baseline: base, variants: {}, raw: results };
for (const [name] of [...variants, ['iframe:cross-origin']]) {
  if (name === 'baseline' || !results[name]) continue;
  const cur = flatten(results[name]);
  const changed = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(cur)])) if (base[k] !== cur[k]) changed[k] = { from: base[k], to: cur[k] };
  out.variants[name] = changed;
  const sig = Object.keys(changed).filter((k) => !NOISE.has(k));
  console.log(`\n### ${name} -> ${sig.length} signal`);
  for (const k of sig) console.log(`   ${k}: ${String(changed[k].from).slice(0, 70)}  =>  ${String(changed[k].to).slice(0, 70)}`);
}
writeFileSync(`${OUT}/diff2.json`, JSON.stringify(out, null, 2));
console.log(`\nwrote ${OUT}/diff2.json`);
