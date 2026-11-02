#!/usr/bin/env python3
"""demo-arkose.py — print the Arkose Labs FunCaptcha flow: the encrypted BDA
envelope POSTed to /fc/gt2/public_key/<pk>, its structure, and the per-site
binding. Uses a production site's public key (Twitter's, from public analyses).
No solving — we characterise the crypto boundary."""
import json, urllib.parse

d = json.load(open('/tmp/opencode/arkose/cap/result.json'))

print('=' * 74)
print('ARKOSE LABS (FunCaptcha) — client flow dissection')
print('=' * 74)
pk = d['pk']
print(f"\n[1] LOADER   client-api.arkoselabs.com/v2/{pk}/api.js   (295 KB, proprietary webpack)")
print("    then  GET /v2/<pk>/settings   (per-site config)")

print("\n[2] TOKEN REQUEST  ->  POST /fc/gt2/public_key/<pk>")
for r in d['reqs']:
    if r['t'] == 'REQ' and 'gt2/public_key' in r['u']:
        q = urllib.parse.parse_qs(r['body'])
        for k in ['c', 'public_key', 'site', 'userbrowser', 'capi_version', 'capi_mode', 'style_theme', 'rnd']:
            if k in q:
                v = q[k][0]
                print(f"      {k:12s}= {('<%d-char BDA envelope>' % len(v)) if k=='c' else v[:64]}")

print("\n[3] THE `c` FIELD = the encrypted BDA (browser data aggregation) fingerprint")
print("    observed head: ebr42HEcpWTHaWlv1zy1nwwUjBnw/d8+CN6CXA==lPWGZok+...")
print("    note the '==' MID-string -> concatenated base64 chunks, i.e.")
print("      b64(iv) + b64(tag) + b64(rsa-wrapped AES key) + b64(ciphertext)")
print("    = AES-256-GCM(fingerprint) with an AES key RSA-OAEP(SHA-256)-wrapped")
print("      under the site's RSA public key. (Matches public RE of the format.)")

print("\n[4] THE CRYPTO IS REAL — and site-bound")
print("    - the per-site RSA public key is reconstructed at runtime inside the")
print("      obfuscated api.js VM (not a static string) -> you cannot forge a")
print("      valid `c` without lifting it (what public solvers do).")
print("    - cross-site key use is rejected: our POST returned")
for r in d['reqs']:
    if r['t'] == 'RES' and 'gt2/public_key' in r['u']:
        print(f"        {r['s']} {r['body'][:60]}")

print("\n[5] ASSESSMENT")
print("  read flow/envelope 🟢 | read BDA plaintext 🔴 | forge `c` 🔴 (need per-site RSA key)")
print("  crypto-RE ~7 (genuine RSA-OAEP+AES-GCM envelope, VM-obfuscated)")
print("  resistance ~70-75 (encrypted BDA + challenge VM + per-site binding)")
print('=' * 74)
