#!/usr/bin/env node
/** ark-probe3.mjs — resolve the last ambiguous scalars (screen depth fields, feature count). */
import { chromium } from 'playwright';
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';

const PK = process.argv[2] || '2CB16598-CB82-4CF7-B332-5990DB66F3AB';
const OUT = '/tmp/opencode/arkose/probe3';
mkdirSync(OUT, { recursive: true });

const page1 = `<!doctype html><html><head><title>ark</title>
<script src="https://client-api.arkoselabs.com/v2/${PK}/api.js" data-callback="setupEnforcement"></script></head>
<body><button id="t">v</button><script>function setupEnforcement(e){window.__enf=e;e.setConfig({selector:'#t'});}</script></body></html>`;
const srv = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(page1); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const CAPTURE = () => {
  const enc = TextEncoder.prototype.encode;
  TextEncoder.prototype.encode = function (input) {
    try { if (typeof input === 'string' && input.startsWith('[{"key":"api_type"') && !window.__bda) window.__bda = input; } catch {}
    return enc.apply(this, arguments);
  };
};

const variantFile = process.argv[3];
const variants = variantFile ? JSON.parse((await import('node:fs')).readFileSync(variantFile, 'utf8')) : [
  ['pixelDepth=48', `Object.defineProperty(Screen.prototype,'pixelDepth',{get:()=>48,configurable:true});`],
  ['colorDepth=48', `Object.defineProperty(Screen.prototype,'colorDepth',{get:()=>48,configurable:true});`],
  ['pixelDepth=48,colorDepth=8', `Object.defineProperty(Screen.prototype,'pixelDepth',{get:()=>48,configurable:true});Object.defineProperty(Screen.prototype,'colorDepth',{get:()=>8,configurable:true});`],
  ['plugins.len=3', `Object.defineProperty(Navigator.prototype,'plugins',{get:()=>[{name:'a'},{name:'b'},{name:'c'}],configurable:true});`],
  ['audio.sampleRate=8000', `const C=window.AudioContext;window.AudioContext=class extends C{constructor(...a){super(a[0]);Object.defineProperty(this,'sampleRate',{get:()=>8000});}};`],
  ['outerWidth=1600,outerHeight=1000', `Object.defineProperty(window,'outerWidth',{get:()=>1600,configurable:true});Object.defineProperty(window,'outerHeight',{get:()=>1000,configurable:true});`],
  ['orientation=portrait', `Object.defineProperty(Screen.prototype,'orientation',{get:()=>({type:'portrait-primary',angle:0}),configurable:true});`],
  ['mimeTypes=3', `Object.defineProperty(Navigator.prototype,'mimeTypes',{get:()=>[{type:'a'},{type:'b'},{type:'c'}],configurable:true});`],
];

const b = await chromium.launch({ headless: false, channel: 'chrome', args: ['--disable-blink-features=AutomationControlled'] });
const results = {};
for (const [name, patch] of variants) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(CAPTURE);
  await ctx.addInitScript({ content: patch });
  const p = await ctx.newPage();
  let text = null;
  try {
    await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1500);
    try { await p.click('#t'); } catch {}
    await p.waitForFunction(() => window.__bda, null, { timeout: 20000 });
    text = await p.evaluate(() => window.__bda);
  } catch (e) { console.error(`[${name}] ${e.message.split('\n')[0]}`); }
  results[name] = text ? JSON.parse(text) : null;
  await ctx.close();
  console.log(`[${name}] ${text ? 'ok' : 'MISSING'}`);
}
await b.close(); srv.close();

const flat = (bda) => {
  const o = {};
  for (const e of bda) {
    if (e.key === 'enhanced_fp') for (const f of e.value) o[`enhanced_fp.${f.key}`] = JSON.stringify(f.value);
    else if (e.key === 'fe') for (const s of e.value) { const i = s.indexOf(':'); o[`fe.${s.slice(0, i)}`] = s.slice(i + 1); }
    else o[e.key] = JSON.stringify(e.value);
  }
  return o;
};
const NOISE = new Set(['n', 'enhanced_fp.4b4b269e68', 'enhanced_fp.navigator_connection_downlink', 'enhanced_fp.4ca87df3d1', 'enhanced_fp.7541c2s', 'f', 'ife_hash', 'wh']);
const base = flat(results[Object.keys(results)[0]] || []);
const out = { baseline: base, variants: {}, raw: results };
for (const [name] of variants) {
  if (!results[name]) continue;
  const cur = flat(results[name]); const ch = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(cur)])) if (base[k] !== cur[k]) ch[k] = { from: base[k], to: cur[k] };
  out.variants[name] = ch;
  const sig = Object.keys(ch).filter((k) => !NOISE.has(k));
  console.log(`\n### ${name} -> ${sig.length}`);
  for (const k of sig) console.log(`   ${k}: ${String(ch[k].from).slice(0, 60)} => ${String(ch[k].to).slice(0, 60)}`);
}
writeFileSync(`${OUT}/probe3.json`, JSON.stringify(out, null, 2));
