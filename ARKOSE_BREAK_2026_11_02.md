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
c = b64(iv‖tag = 28 B) + b64(RSA-OAEP-wrapped AES key = 256 B) + b64(AES-GCM ciphertext)
```

i.e. the BDA (a large real-browser fingerprint) is **AES-256-GCM**-encrypted with
a random AES key, which is itself **RSA-OAEP(SHA-256)**-wrapped under the site's
RSA public key. Round 2 confirmed the exact split (40/344/9432 b64 chars =
28/256/7074 bytes); the 7 070-byte plaintext is in §5.

## 4. The crypto is real — and site-bound

- The **per-site RSA public key is not a static string** in `api.js`; the client
  reconstructs it at runtime inside the obfuscated VM. Forging a valid `c`
  therefore requires **lifting that key** (which is what public solvers do — e.g.
  capturing it from a real browser mint). We did **not** do this.
- **Per-site binding works**: posting to a production key from our non-matching
  origin returned `400 {"error":"DENIED ACCESS"}`.

## 5. Round 2 (2026-11-13): the BDA plaintext, and what it collects

Round 1 stopped at the envelope. This round reads the plaintext by hooking the
**serialization boundary** (`TextEncoder.prototype.encode`) instead of the crypto
boundary. That works because the client serialises the BDA to a JSON string and
then hands it to WebCrypto; hooking `subtle.encrypt` alone only shows key
material (the AES key is 32 bytes, the RSA-OAEP input).

### 5.1 Envelope confirmed and split exactly

```
c = b64( iv‖tag  = 28 B ) ‖ b64( RSA-OAEP(k) = 256 B ) ‖ b64( AES-GCM ct = 7074 B )
```

Total 9 816 b64 chars; plaintext is a **7 070-byte JSON array** of `{key,value}`.
The RSA-OAEP input is exactly 32 bytes (the AES key), so key wrap and content
encryption are separate operations, both observable.

### 5.2 The plaintext

A 91-entry `enhanced_fp` array plus a 23-entry low-entropy `fe` array plus
`f`, `n`, `wh`, `ife_hash`, `jsbd`, `c`. Full field-by-field catalog with the
API each field is fed by: **[`FIELD_CATALOG.md`](FIELD_CATALOG.md)**.

Headline contents:

- **WebGL** — 19 fields: extension list, vendor/renderer/version/GLSL,
  aliased line/point ranges, antialiasing, bits, 11 max-params, viewport dims,
  **unmasked** vendor/renderer, four shader-precision vectors, plus two hashes.
- **Canvas** — `CFP` (canvas hash) in `fe`; changing `fillText` moved it
  `721427748 → −668895008`.
- **Audio** — `audio_fingerprint` = summed `OfflineAudioContext(1, 44100, 44100)`
  output, `124.04347527516074`; media codec supports via `MediaSource.isTypeSupported`.
- **Math** — `math_fingerprint`, `supported_math_functions`.
- **Device/network** — `deviceMemory`, `hardwareConcurrency`, languages, DPR,
  screen/window geometry, `screen_pixel_depth` (**colorDepth × 3**),
  `screen.orientation.type`, HDR support, `performance.memory`,
  connection `rtt/downlink/saveData`, battery charging state,
  `enumerateDevices()` count (md5), speech-synthesis voice list.
- **Anti-automation** — `headless_browser_phantom|selenium|nightmare_js`,
  `browser_detection_firefox|brave`, `browser_object_checks`, and `FOS/FB/FR`
  which the client turns into a `fb: 1` spoof marker.
- **Frame tree** — `window__ancestor_origins`, `window__tree_index`,
  `window__tree_structure` from `location.ancestorOrigins` + the `parent` chain.
  Embedding the widget in a cross-origin iframe leaked the parent origin
  (`["http://127.0.0.1:PORT"]`, `[0]`, `"[[]]"`) with no prompt.

### 5.3 Integrity layer (why editing the BDA is not enough)

Bundle module 5194 is a **custom MurmurHash3-128 variant** (32-bit pair
arithmetic, output 32 hex), plus plain MD5 elsewhere. Verified exactly:

| field | construction |
|---|---|
| `f` | `murmur128(fe values joined ";", seed 0)` |
| `ife_hash` | `murmur128(fe joined ", ", seed 38)` |
| `wh` | `murmur128(window own keys, seed 420)` ‖ `murmur128(proto-chain keys, seed 420)` |

`wh` is a **global-namespace tamper detector**: adding `window.foo123=1`,
deleting `window.WebAssembly`, or even defining our capture hook changed its
first half; the second half (prototype chain) stayed constant. Any extension,
polyfill or instrumentation is therefore visible to the server *before* the
envelope is opened. `n` is `base64(unix seconds)` for replay windows, and the
`fe`/`enhanced_fp` split lets the server run cheap checks (and the `f` digest)
without decrypting.

Several hash fields append **invisible Unicode** (`U+2062`/`U+2063`) to 32-hex
MD5s — e.g. `29s83ih9 = md5("false")+U+2063`,
`c8480e29a = md5("https://client-api.arkoselabs.com")+U+2062`.

### 5.4 Identifiers: what is and isn't trackable

- `4b4b269e68` is a per-load **session UUID**, identical to the `id` posted to
  `/metrics/ui`; it changes every load.
- `lfasdgs = ea52f7b4-…` looks like a device ID but is a **hard-coded constant**
  in the bundle (`E="ea52f7b4…"`); it was identical in three fresh browser
  profiles and with `localStorage` blocked. Not a tracker.
- The rest of the UUID/hash-shaped fields (`6a62b2a558`, `83eb055`, `05d3d24`)
  are stable **build/page hashes**, useful for versioning the client, not users.

### 5.5 Unencrypted side channel

`POST /metrics/ui` sends **plaintext** `device.platform`, `device.language`,
`device.connection{effectiveType,rtt,downlink}`, `locationOrigin`,
`locationPathname`, the session id, per-stage timings and the error object
(`API_REQUEST_ERROR`, status 400). So even a rejected BDA still reports
platform/language/connection/origin and the exact failure reason.

### 5.6 Method note

Fields were named by **perturbation**, not by reading minified code: patch one
browser surface before `api.js` runs, capture the BDA, diff (47 variants across
`ark-diff.mjs`, `ark-diff2.mjs`, `ark-probe3.mjs`). A field that moves is fed by
that surface. Unnamed fields are marked † in the catalog rather than guessed.

## 6. Assessment

- **Crypto-RE: ~7** — genuine RSA-OAEP + AES-GCM envelope, obfuscated VM, no
  static key to lift from the shipped asset. Plaintext is readable at the
  serialization boundary, but the envelope integrity is sound.
- **Data collection: very high** — ~90 signals, including GPU strings, canvas,
  audio, math, fonts, codecs, permissions, frame-tree ancestry and a
  self-integrity layer. See `FIELD_CATALOG.md`.
- **Resistance: ~70-75** — encrypted BDA + challenge VM + per-site binding. The
  client cannot mint a token without the per-site key and a real fingerprint.
  The `wh` hash makes naive client instrumentation detectable even before
  decryption, and `fb:1` self-reports platform/UA inconsistency.
- Good-vs-bad framing: a **good** design — real client crypto sealed to a server
  key, plus a challenge and per-site binding.

## Scope note

Public key only; no challenge solved; no valid token obtained (cross-site POST
correctly denied). No private key was recovered and no token was forged — the
plaintext was observed on the client side, where it necessarily exists before
encryption. Findings stated honestly, never overstated; unnamed fields are
marked † rather than guessed.
