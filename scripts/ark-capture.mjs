#!/usr/bin/env node
/** ark-capture.mjs — drive Arkose Labs FunCaptcha's client (public key from a
 *  production site) and capture the token flow: the /fc/gt2/public_key/{pk}
 *  POST carrying the encrypted BDA envelope, plus any /fc/gfct/ challenge calls.
 *  No solving — we characterise the envelope and the crypto boundary. */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';

const PK = process.argv[2] || '2CB16598-CB82-4CF7-B332-5990DB66F3AB';
const OUT = '/tmp/opencode/arkose/cap';
mkdirSync(OUT, { recursive: true });

const srv = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html><head>
<script src="https://client-api.arkoselabs.com/v2/${PK}/api.js" data-callback="setupEnforcement"></script>
</head><body>
<button id="trigger">verify</button>
<script>
  function setupEnforcement(myEnforcement){
    window.__enf = myEnforcement;
    myEnforcement.setConfig({
      selector: '#trigger',
      onCompleted: (r)=>{ window.__ark = { completed: r }; },
      onError: (e)=>{ window.__ark = { error: String(e).slice(0,200) }; },
    });
  }
</script></body></html>`);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const b = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const reqs = [];
page.on('request', (req) => {
  const u = req.url();
  if (/arkoselabs|funcaptcha/.test(u)) reqs.push({ t: 'REQ', m: req.method(), u, body: (req.postData() || '') });
});
page.on('response', async (res) => {
  const u = res.url();
  if (/arkoselabs|funcaptcha/.test(u)) {
    let text = ''; try { text = (await res.text()).slice(0, 300); } catch (_) {}
    reqs.push({ t: 'RES', s: res.status(), u, body: text, setCookie: res.headers()['set-cookie'] || null });
  }
});

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
try { await page.click('#trigger'); } catch (_) {}
await page.waitForTimeout(12000);

const state = await page.evaluate(() => ({
  ark: window.__ark || null,
  token: (document.querySelector('[name="fc-token"]') || {}).value,
  iframes: [...document.querySelectorAll('iframe')].map(f => f.src.slice(0, 90)),
})).catch(e => ({ err: String(e).slice(0, 150) }));

writeFileSync(OUT + '/result.json', JSON.stringify({ pk: PK, reqs, state }, null, 2));
console.log(`=== ARKOSE (pk=${PK}) ===`);
console.log('state:', JSON.stringify(state).slice(0, 300));
console.log('\nrequests:');
for (const r of reqs) {
  if (r.t === 'RES') console.log(`  RES ${r.s} ${r.u.slice(0, 100)}`);
  else {
    console.log(`  ${r.m} ${r.u.slice(0, 100)}  body=${r.body.length}B`);
    if (r.body) {
      const parts = r.body.split('&').map(x => x.split('=')[0]);
      console.log('      fields:', parts.join(', '));
    }
  }
}
srv.close(); await b.close();
