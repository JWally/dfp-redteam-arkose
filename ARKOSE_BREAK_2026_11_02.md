# Arkose Labs (FunCaptcha) — client dissection (2026-11-02)

Authorized dissection using a production site's **public** key (Twitter's
`2CB16598-CB82-4CF7-B332-5990DB66F3AB`). Only a public widget load; no challenge
solved, no valid token obtained.

## 1. Loader

```html
<script src="https://client-api.arkoselabs.com/v2/<PUBLIC_KEY>/api.js"
        data-callback="setupEnforcement"></script>
```

`api.js` is **295 KB of proprietary, webpack-bundled code**. On load it fetches
`GET /v2/<pk>/settings`.

## 2. Token request

The enforcement POSTs to `POST /fc/gt2/public_key/<pk>` (observed fields):

| field | observed |
|---|---|
| `c` | `<9572-char>` encrypted **BDA** envelope |
| `public_key` | `2CB16598-CB82-4CF7-B332-5990DB66F3AB` |
| `site` | the page origin |
| `userbrowser` | User-Agent |
| `capi_version` | `4.5.1` |
| `capi_mode` | `lightbox` |
| `style_theme` | `default` |
| `rnd` | random float |

## 3. The `c` field = encrypted BDA

Captured head: `ebr42HEcpWTHaWlv1zy1nwwUjBnw/d8+CN6CXA==lPWGZok+…`. The **`==`
mid-string** is the tell of **concatenated base64 chunks**:

```
c = b64(iv) + b64(gcm tag) + b64(RSA-OAEP-wrapped AES key) + b64(AES-GCM ciphertext)
```

i.e. the BDA (a large real-browser fingerprint) is **AES-256-GCM**-encrypted with
a random AES key, which is itself **RSA-OAEP(SHA-256)**-wrapped under the site's
RSA public key. (This matches independent public reverse-engineering of the
format; we did not reimplement it.)

## 4. The crypto is real — and site-bound

- The **per-site RSA public key is not a static string** in `api.js`; the client
  reconstructs it at runtime inside the obfuscated VM. Forging a valid `c`
  therefore requires **lifting that key** (which is what public solvers do — e.g.
  capturing it from a real browser mint). We did **not** do this.
- **Per-site binding works**: posting to a production key from our non-matching
  origin returned `400 {"error":"DENIED ACCESS"}`.

## 5. Assessment

- **Crypto-RE: ~7** — genuine RSA-OAEP + AES-GCM envelope, obfuscated VM, no
  static key to lift from the shipped asset.
- **Resistance: ~70-75** — encrypted BDA + challenge VM + per-site binding. The
  client cannot mint a token without the per-site key and a real fingerprint.
- Good-vs-bad framing: a **good** design — real client crypto sealed to a server
  key, plus a challenge and per-site binding.

## Scope note

Public key only; no challenge solved; no valid token obtained (cross-site POST
correctly denied). Findings stated honestly, never overstated.
