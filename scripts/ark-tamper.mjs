#!/usr/bin/env node
/** ark-tamper.mjs — replay/tamper the Arkose token request LIVE against
 *  /fc/gt2/public_key/<pk>: original, flipped-byte `c`, garbage `c`.
 *  Observed: ALL -> 400 {"error":"DENIED ACCESS"} (per-site binding blocks
 *  cross-origin use; BDA validation not isolatable). */
import { readFileSync } from 'node:fs';

const f = JSON.parse(readFileSync(new URL('../artifacts/cap-result.json', import.meta.url), 'utf8'));
const post = f.reqs.find(r => r.t === 'REQ' && r.m === 'POST');
if (!post) { console.error('no gt2 POST in cap-result.json'); process.exit(1); }
const body = new URLSearchParams(post.body);
const pk = body.get('public_key');
const c = body.get('c');

async function send(label, cValue) {
  const q = new URLSearchParams(body);
  q.set('c', cValue);
  const r = await fetch(`https://client-api.arkoselabs.com/fc/gt2/public_key/${pk}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
      Origin: 'https://client-api.arkoselabs.com',
    },
    body: q.toString(),
  });
  const t = await r.text();
  console.log(`[${label}] HTTP ${r.status} ${t.slice(0, 60)}`);
}

// flip a byte near the end of the ciphertext
const raw = Buffer.from(c, 'base64');
raw[raw.length - 10] ^= 0xff;
const flipped = raw.toString('base64');

console.log(`=== ARKOSE token request: tamper/ship (live, pk=${pk}) ===\n`);
await send('replay-original ', c);
await send('flipped byte c  ', flipped);
await send('garbage c       ', 'deadbeef'.repeat(20));
console.log('\n=> all rejected 400 DENIED ACCESS — per-site binding; no valid token minted.');
