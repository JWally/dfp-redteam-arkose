#!/usr/bin/env node
/** ark-diff.mjs — name Arkose's obfuscated BDA fields by perturbation.
 *
 * For each variant we patch exactly one browser/JS surface before api.js runs,
 * capture the BDA plaintext at the TextEncoder boundary, and diff the field
 * set against a baseline. A field that changes is fed by that surface.
 *
 * Public key only; nothing is solved and no token is minted. The gt2 call is
 * expected to 400 (per-site binding) — we only care about the plaintext.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';

const PK = process.argv[2] || '2CB16598-CB82-4CF7-B332-5990DB66F3AB';
const OUT = '/tmp/opencode/arkose/diff';
mkdirSync(OUT, { recursive: true });

const srv = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html><head><title>ark</title>
<script src="https://client-api.arkoselabs.com/v2/${PK}/api.js" data-callback="setupEnforcement"></script>
</head><body><button id="t">verify</button>
<script>function setupEnforcement(e){window.__enf=e;e.setConfig({selector:'#t'});}</script>
</body></html>`);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

// Runs at document start, before api.js. Captures the BDA string.
const CAPTURE = () => {
  const enc = TextEncoder.prototype.encode;
  TextEncoder.prototype.encode = function (input) {
    try {
      if (typeof input === 'string' && input.startsWith('[{"key":"api_type"') && !window.__bda) {
        window.__bda = input;
      }
    } catch {}
    return enc.apply(this, arguments);
  };
};

const variants = [
  ['baseline', ''],
  ['hardwareConcurrency=3', `Object.defineProperty(Navigator.prototype,'hardwareConcurrency',{get:()=>3,configurable:true});`],
  ['deviceMemory=4', `Object.defineProperty(Navigator.prototype,'deviceMemory',{get:()=>4,configurable:true});`],
  ['languages=fr-FR', `Object.defineProperty(Navigator.prototype,'languages',{get:()=>['fr-FR','fr'],configurable:true});Object.defineProperty(Navigator.prototype,'language',{get:()=>'fr-FR',configurable:true});`],
  ['platform=Win32', `Object.defineProperty(Navigator.prototype,'platform',{get:()=>'Win32',configurable:true});`],
  ['uaData.brands=Edge', `try{Object.defineProperty(Navigator.prototype,'userAgentData',{get:()=>({brands:[{brand:'Microsoft Edge',version:'131'},{brand:'Chromium',version:'131'}],mobile:false,platform:'Windows'}),configurable:true});}catch(e){}`],
  ['screen=1920x1080', `const p=Screen.prototype;for(const [k,v] of [['width',1920],['height',1080],['availWidth',1920],['availHeight',1040]])Object.defineProperty(p,k,{get:()=>v,configurable:true});`],
  ['colorDepth=24', `Object.defineProperty(Screen.prototype,'colorDepth',{get:()=>24,configurable:true});Object.defineProperty(Screen.prototype,'pixelDepth',{get:()=>24,configurable:true});`],
  ['innerSize=1000x700', `Object.defineProperty(window,'innerWidth',{get:()=>1000,configurable:true});Object.defineProperty(window,'innerHeight',{get:()=>700,configurable:true});Object.defineProperty(window,'outerWidth',{get:()=>1000,configurable:true});Object.defineProperty(window,'outerHeight',{get:()=>800,configurable:true});`],
  ['canvas.fillText-noise', `const f=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(){arguments[1]=(arguments[1]||0)+0.5;return f.apply(this,arguments);};`],
  ['canvas.getImageData-noise', `const g=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(){const d=g.apply(this,arguments);if(d.data.length)d.data[0]^=1;return d;};`],
  ['audio.getChannelData-noise', `const g=AudioBuffer.prototype.getChannelData;AudioBuffer.prototype.getChannelData=function(){const a=g.apply(this,arguments);if(a.length)a[0]+=1e-4;return a;};`],
  ['math.sin-noise', `const s=Math.sin;for(const k of ['sin','cos','tan','log','exp','atan2','pow'])Math[k]=function(){return (s.apply(null,arguments)||0)+1e-9;};`],
  ['webgl.unmaskedRenderer', `for(const C of ['WebGLRenderingContext','WebGL2RenderingContext']){const g=window[C]&&C.prototype;if(!g)continue;const p=g.getParameter;g.getParameter=function(a){if(a===0x9246)return 'Fake Corp';if(a===0x9245)return 'Fake Renderer';return p.apply(this,arguments);};}`],
  ['webdriver=true', `Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>true,configurable:true});`],
  ['cookieEnabled=false', `Object.defineProperty(Navigator.prototype,'cookieEnabled',{get:()=>false,configurable:true});`],
  ['doNotTrack=1', `Object.defineProperty(Navigator.prototype,'doNotTrack',{get:()=>'1',configurable:true});`],
  ['connection.rtt=700', `Object.defineProperty(Navigator.prototype,'connection',{get:()=>({effectiveType:'2g',rtt:700,downlink:0.3,saveData:true}),configurable:true});`],
  ['battery=0.13', `navigator.getBattery=async()=>({charging:false,level:0.13,chargingTime:Infinity,dischargingTime:100});`],
  ['touch=5', `Object.defineProperty(Navigator.prototype,'maxTouchPoints',{get:()=>5,configurable:true});Object.defineProperty(window,'ontouchstart',{get:()=>null,configurable:true});`],
  ['speechVoices=2', `try{SpeechSynthesis.prototype.getVoices=function(){return [{name:'A',lang:'en-US',default:true,localService:true,voiceURI:'a'},{name:'B',lang:'de-DE',default:false,localService:true,voiceURI:'b'}];};}catch(e){}`],
  ['mediaDevices=0', `try{navigator.mediaDevices.enumerateDevices=async()=>[];}catch(e){}`],
  ['fonts.check=false', `try{Document.prototype.fonts=undefined;}catch(e){}`],
  ['history.length=9', `Object.defineProperty(History.prototype,'length',{get:()=>9,configurable:true});`],
  ['title=XYZ', `document.title='XYZ';`],
  ['storage.quota=1', `try{navigator.storage.estimate=async()=>({quota:1,usage:0});}catch(e){}`],
  ['permissions=denied', `try{navigator.permissions.query=async()=>({state:'denied',onchange:null});}catch(e){}`],
  ['extraGlobal', `window.foo123=1;`],
  ['deleteGlobal', `delete window.chrome;`],
];

const b = await chromium.launch({ headless: false, channel: 'chrome', args: ['--disable-blink-features=AutomationControlled'] });
const results = {};

for (const [name, patch] of variants) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(CAPTURE);
  if (patch) await ctx.addInitScript({ content: patch });
  const page = await ctx.newPage();
  let text = null;
  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    try { await page.click('#t'); } catch {}
    await page.waitForFunction(() => window.__bda, null, { timeout: 20000 });
    text = await page.evaluate(() => window.__bda);
  } catch (e) {
    console.error(`[${name}] capture failed: ${e.message.split('\n')[0]}`);
  }
  results[name] = text ? JSON.parse(text) : null;
  await ctx.close();
  console.log(`[${name}] ${text ? 'ok' : 'MISSING'}`);
}
await b.close();
srv.close();

const flatten = (bda) => {
  const o = {};
  if (!bda) return o;
  for (const e of bda) {
    if (e.key === 'enhanced_fp') for (const f of e.value) o[`enhanced_fp.${f.key}`] = JSON.stringify(f.value);
    else if (e.key === 'fe') for (const s of e.value) {
      const i = s.indexOf(':');
      o[`fe.${s.slice(0, i)}`] = s.slice(i + 1);
    } else o[e.key] = JSON.stringify(e.value);
  }
  return o;
};

const base = flatten(results.baseline);
const out = { pk: PK, variants: {}, raw: results };
out.baseline = base;
for (const [name] of variants) {
  if (name === 'baseline' || !results[name]) continue;
  const cur = flatten(results[name]);
  const changed = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(cur)])) {
    if (base[k] !== cur[k]) changed[k] = { from: base[k], to: cur[k] };
  }
  out.variants[name] = changed;
  console.log(`\n### ${name} -> ${Object.keys(changed).length} changed`);
  for (const [k, v] of Object.entries(changed)) console.log(`   ${k}: ${String(v.from).slice(0, 70)}  ->  ${String(v.to).slice(0, 70)}`);
}
writeFileSync(`${OUT}/diff.json`, JSON.stringify(out, null, 2));
console.log(`\nwrote ${OUT}/diff.json`);
