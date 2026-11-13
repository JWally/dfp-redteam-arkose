#!/usr/bin/env node
/** ark-hook.mjs — enumerate what the Arkose client collects by hooking the
 *  crypto/serialization boundaries and the browser APIs it touches. Public
 *  key only; no challenge solved. */
import { chromium } from 'playwright';
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';

const PK = process.argv[2] || '2CB16598-CB82-4CF7-B332-5990DB66F3AB';
const OUT = '/tmp/opencode/arkose/hook';
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
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const b = await chromium.launch({ headless: false, channel: 'chrome', args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });

await ctx.addInitScript(() => {
  const hooks = (window.__arkHooks = []);
  const push = (kind, data) => {
    if (hooks.length > 800) return;
    try { hooks.push({ kind, ...data }); } catch {}
  };
  const b64 = (bytes) => {
    try {
      let s = '';
      const u = new Uint8Array(bytes);
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
      return btoa(s);
    } catch { return null; }
  };
  const asText = (data) => {
    try {
      if (typeof data === 'string') return data.slice(0, 12000);
      if (data instanceof ArrayBuffer) return new TextDecoder().decode(data).slice(0, 12000);
      if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data).slice(0, 12000);
    } catch {}
    return null;
  };
  const maybeJson = (text) => {
    if (!text || text.length < 20) return null;
    if (!/[{}]/.test(text)) return null;
    return text;
  };

  // --- WebCrypto boundary -------------------------------------------------
  if (globalThis.SubtleCrypto) {
    const enc = SubtleCrypto.prototype.encrypt;
    SubtleCrypto.prototype.encrypt = function (algorithm, key, data) {
      push('subtle.encrypt', { alg: algorithm && algorithm.name, keyAlg: key && key.algorithm && key.algorithm.name, len: data && (data.byteLength ?? data.length), text: maybeJson(asText(data)), b64: data ? b64(data).slice(0, 400) : null });
      return enc.apply(this, arguments);
    };
    const wrap = SubtleCrypto.prototype.wrapKey;
    SubtleCrypto.prototype.wrapKey = function (format, key, wrappingKey, wrapAlgorithm) {
      push('subtle.wrapKey', { format, keyAlg: key && key.algorithm && key.algorithm.name, wrapAlg: wrapAlgorithm && wrapAlgorithm.name });
      return wrap.apply(this, arguments);
    };
    const imp = SubtleCrypto.prototype.importKey;
    SubtleCrypto.prototype.importKey = function (format, keyData, algorithm, extractable, usages) {
      push('subtle.importKey', { format, alg: algorithm && algorithm.name, extractable, usages, text: format === 'jwk' ? JSON.stringify(keyData).slice(0, 2000) : null, len: keyData && (keyData.byteLength ?? keyData.length) });
      return imp.apply(this, arguments);
    };
    const exp = SubtleCrypto.prototype.exportKey;
    SubtleCrypto.prototype.exportKey = function (format, key) {
      push('subtle.exportKey', { format, alg: key && key.algorithm && key.algorithm.name });
      return exp.apply(this, arguments);
    };
    const gen = SubtleCrypto.prototype.generateKey;
    SubtleCrypto.prototype.generateKey = function (algorithm, extractable, usages) {
      push('subtle.generateKey', { alg: algorithm && algorithm.name, extractable, usages });
      return gen.apply(this, arguments);
    };
  }

  // --- serialization boundary ---------------------------------------------
  const stringify = JSON.stringify;
  JSON.stringify = function (value, ...rest) {
    try {
      if (value && typeof value === 'object') {
        const keys = Array.isArray(value) ? value.map((v) => v && v.key).filter(Boolean) : Object.keys(value);
        if (keys.some((k) => ['api_type', 'f_h', 'enhanced_fp', 'ife_hash', 'f', 'wh', 'jsbd', 'fe'].includes(String(k)))) {
          push('json.stringify.bda', { keys, text: stringify.call(JSON, value).slice(0, 12000) });
        }
      }
    } catch {}
    return stringify.apply(this, arguments);
  };

  if (globalThis.TextEncoder) {
    const encode = TextEncoder.prototype.encode;
    TextEncoder.prototype.encode = function (input) {
      try {
        if (typeof input === 'string' && input.length > 10 && /[{}]|f_h|api_type|enhanced_fp/.test(input)) {
          push('textencoder', { len: input.length, text: input.slice(0, 12000) });
        }
      } catch {}
      return encode.apply(this, arguments);
    };
  }

  // --- network ------------------------------------------------------------
  const fetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const u = typeof input === 'string' ? input : input && input.url;
      if (u && /arkoselabs|funcaptcha/.test(u)) {
        const body = init && init.body;
        push('fetch', { url: String(u).slice(0, 200), method: init && init.method, body: typeof body === 'string' ? body.slice(0, 16000) : body ? Object.prototype.toString.call(body) : null });
      }
    } catch {}
    return fetch.apply(this, arguments);
  };
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (this.__arkUrl) push('xhr', { url: this.__arkUrl, body: typeof body === 'string' ? body.slice(0, 16000) : body ? Object.prototype.toString.call(body) : null });
    } catch {}
    return xhrSend.apply(this, arguments);
  };
  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try { this.__arkUrl = String(url).slice(0, 200); } catch {}
    return xhrOpen.apply(this, [method, url, ...rest]);
  };

  // --- browser API touches ------------------------------------------------
  const logCall = (kind, name, data) => push(kind, { name, ...data });

  if (globalThis.HTMLCanvasElement) {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      logCall('canvas', 'getContext', { type });
      return getContext.apply(this, [type, ...rest]);
    };
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const out = toDataURL.apply(this, args);
      logCall('canvas', 'toDataURL', { len: out.length, head: out.slice(0, 60) });
      return out;
    };
  }
  if (globalThis.CanvasRenderingContext2D) {
    for (const name of ['measureText', 'fillText', 'strokeText', 'getImageData']) {
      const orig = CanvasRenderingContext2D.prototype[name];
      if (typeof orig !== 'function') continue;
      CanvasRenderingContext2D.prototype[name] = function (...args) {
        try {
          const a = args.map((x) => (typeof x === 'string' ? x.slice(0, 80) : typeof x === 'number' ? x : Object.prototype.toString.call(x)));
          logCall('canvas2d', name, { args: a.slice(0, 6) });
        } catch {}
        return orig.apply(this, args);
      };
    }
  }
  for (const Ctor of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
    const c = globalThis[Ctor];
    if (!c) continue;
    for (const name of ['getParameter', 'getExtension', 'getSupportedExtensions', 'readPixels']) {
      const orig = c.prototype[name];
      if (typeof orig !== 'function') continue;
      c.prototype[name] = function (...args) {
        try {
          const a = args.map((x) => (typeof x === 'number' ? x : Object.prototype.toString.call(x)));
          logCall('webgl', `${Ctor}.${name}`, { args: a.slice(0, 4) });
        } catch {}
        return orig.apply(this, args);
      };
    }
  }
  for (const Ctor of ['AudioContext', 'OfflineAudioContext', 'webkitAudioContext']) {
    const C = globalThis[Ctor];
    if (!C) continue;
    const wrapped = new Proxy(C, {
      construct(target, args) {
        logCall('audio', 'constructor', { ctor: Ctor, args: args.map((x) => (typeof x === 'number' ? x : typeof x)) });
        return Reflect.construct(target, args);
      },
    });
    globalThis[Ctor] = wrapped;
  }
  if (globalThis.SpeechSynthesis) {
    const gv = SpeechSynthesis.prototype.getVoices;
    SpeechSynthesis.prototype.getVoices = function (...args) {
      const voices = gv.apply(this, args);
      logCall('speech', 'getVoices', { count: voices && voices.length });
      return voices;
    };
  }
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    const ed = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = async (...args) => {
      const list = await ed(...args);
      logCall('media', 'enumerateDevices', { count: list && list.length, kinds: list && list.map((d) => d.kind) });
      return list;
    };
  }
  if (navigator.getBattery) {
    const gb = navigator.getBattery.bind(navigator);
    navigator.getBattery = async (...args) => {
      const bty = await gb(...args);
      logCall('battery', 'getBattery', { charging: bty.charging, level: bty.level });
      return bty;
    };
  }
  if (navigator.getGamepads) {
    const gg = navigator.getGamepads.bind(navigator);
    navigator.getGamepads = (...args) => {
      const pads = gg(...args);
      logCall('gamepad', 'getGamepads', { count: pads && pads.filter(Boolean).length });
      return pads;
    };
  }

  // navigator/screen property reads
  const navProps = ['userAgent', 'platform', 'vendor', 'language', 'languages', 'hardwareConcurrency', 'deviceMemory', 'maxTouchPoints', 'webdriver', 'cookieEnabled', 'onLine', 'doNotTrack', 'plugins', 'mimeTypes', 'connection', 'userAgentData', 'mediaDevices', 'getBattery', 'getGamepads', 'storage', 'permissions', 'pdfViewerEnabled', 'product', 'productSub', 'appName', 'appVersion', 'oscpu'];
  for (const prop of navProps) {
    try {
      const d = Object.getOwnPropertyDescriptor(Navigator.prototype, prop);
      if (!d || !d.get) continue;
      Object.defineProperty(Navigator.prototype, prop, {
        ...d,
        get() {
          let v;
          try { v = d.get.call(this); } catch (e) { v = undefined; }
          try {
            const summary = typeof v === 'object' && v !== null ? Object.prototype.toString.call(v) : v;
            logCall('navigator', prop, { value: typeof summary === 'string' ? summary.slice(0, 160) : summary });
          } catch {}
          return v;
        },
      });
    } catch {}
  }
  for (const prop of ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth']) {
    try {
      const d = Object.getOwnPropertyDescriptor(Screen.prototype, prop);
      if (!d || !d.get) continue;
      Object.defineProperty(Screen.prototype, prop, {
        ...d,
        get() { const v = d.get.call(this); logCall('screen', prop, { value: v }); return v; },
      });
    } catch {}
  }
});

const page = await ctx.newPage();
const reqs = [];
page.on('request', (req) => {
  const u = req.url();
  if (/arkoselabs|funcaptcha/.test(u)) reqs.push({ m: req.method(), u, body: (req.postData() || '').slice(0, 20000) });
});
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
try { await page.click('#trigger'); } catch {}
await page.waitForTimeout(15000);

const hooks = await page.evaluate(() => window.__arkHooks || []).catch(() => []);
const state = await page.evaluate(() => ({ ark: window.__ark || null, iframes: [...document.querySelectorAll('iframe')].map((f) => f.src.slice(0, 120)) })).catch(() => ({}));

writeFileSync(`${OUT}/result.json`, JSON.stringify({ pk: PK, hooks, reqs, state }, null, 2));
console.log(`pk=${PK} hooks=${hooks.length} requests=${reqs.length}`);
const kinds = {};
for (const h of hooks) kinds[h.kind] = (kinds[h.kind] || 0) + 1;
console.log('hook kinds:', JSON.stringify(kinds));
for (const h of hooks.filter((x) => x.kind === 'subtle.encrypt' || x.kind === 'json.stringify.bda' || x.kind === 'textencoder')) {
  console.log(`\n[${h.kind}] alg=${h.alg || ''} keys=${JSON.stringify(h.keys || [])} len=${h.len || ''}`);
  console.log((h.text || '').slice(0, 600));
}
srv.close();
await b.close();
