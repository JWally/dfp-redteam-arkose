# What Arkose FunCaptcha (api.js 4.5.1) collects — field catalog

Captured from a production site's **public** key (`2CB16598-…F3AB`), 2026-11-13.
No challenge solved, no token minted. The widget stops at the `gt2` call because
of the per-site binding (`400 DENIED ACCESS`); everything below is client-side
collection observed **before** that call.

## How we read it

`api.js` builds the fingerprint object in JS, serialises it through
`TextEncoder.encode`, then encrypts:

```
plaintext = JSON array [ {key,value}, … ]                (7 070 bytes here)
k         = random 256-bit AES key                       (32 bytes)
wrapped   = RSA-OAEP-SHA256(k, site public key)          (256 bytes)
ct        = AES-256-GCM(k, plaintext)                    (same length as plaintext)
c         = b64(iv‖tag 28B) ‖ b64(wrapped 256B) ‖ b64(ct)
```

Hooked at `TextEncoder.prototype.encode` (no crypto hook needed) → plaintext.
Confirmed `c` splits exactly into 40/344/9432 base64 chars = 28/256/7074 bytes.

Scripts: `scripts/ark-hook.mjs` (capture + API inventory), `scripts/ark-diff.mjs`
/ `ark-diff2.mjs` / `ark-probe3.mjs` (field attribution by perturbation),
`scripts/ark-persist.mjs` (identifier stability).

Artifacts: `artifacts/bda-plaintext.json`, `artifacts/bda-diff-batch{1,2,3}.json`,
`artifacts/hook-result.json`.

## Integrity hashes (all reverse-engineered, exact)

Arkose ships a **custom MurmurHash3-128 variant** in bundle module 5194
(`K(str, seed)`), output as 32 hex chars, plus plain MD5 elsewhere.

| field | construction — verified |
|---|---|
| `f` | `murmur128( fe-values.join(";"), seed 0 )` |
| `ife_hash` | `murmur128( fe.join(", "), seed 38 )` |
| `wh` | `murmur128( Object.keys(window).join("|"), seed 420 )` **‖** `murmur128( prototype-chain keys, seed 420 )` |
| `n` | `base64(floor(Date.now()/1000))` — replay timestamp |
| `c` | static string `Copyright (c) 2026 Arkose Labs…` (decoy) |

Notes:
- `f` is a digest of only the **low-entropy** `fe` values → the server can detect
  any edit to `fe` without decrypting.
- `wh` is a **tamper detector over global names**. Adding one global
  (`window.foo123=1`), deleting one (`delete window.WebAssembly`), or defining
  `__bda` changes the first half; the second half stayed constant in every run
  (hash of the built-in prototype chain). Practical consequence: any JS hook,
  polyfill, extension, or instrumentation changes `wh` even when the rest of the
  BDA is untouched.
- Several MD5 fields carry invisible Unicode suffixes — `U+2063` on `29s83ih9`,
  `U+2062` on `c8480e29a`. They survive JSON round-trips and defeat naive
  string comparison; `29s83ih9 == md5("false")+U+2063`.

## `fe` — 23 low-entropy fields (server-side "easy" checks)

| key | value here | source (evidence) |
|---|---|---|
| `DNT` | `unknown` | `navigator.doNotTrack` (patched to `1` → `1`) |
| `L` | `en-US` | `navigator.language` |
| `D` | `24` | `screen.colorDepth` (patched to 48 → 48) |
| `PR` | `1` | `devicePixelRatio` |
| `S` | `1280,900` | `screen.width,height` |
| `AS` | `1280,900` | `screen.availWidth,availHeight` |
| `TO` | `360` | `Date.getTimezoneOffset()` (patched to −540) |
| `SS` | `true` | sessionStorage usable |
| `LS` | `true` | localStorage usable |
| `IDB` | `true` | indexedDB usable |
| `B` | `false` | unresolved boolean |
| `ODB` | `false` | window.openDatabase present |
| `CPUC` | `unknown` | CPU class (not exposed on Linux) |
| `PK` | `Linux x86_64` | `navigator.platform` |
| `CFP` | `721427748` | **canvas hash** (fillText noise → −668895008) |
| `FR` | `false` | Firefox flag |
| `FOS` | `false` | **spoof flag**: flipping `navigator.platform` to `Win32` while UA stays Linux flipped it `true` |
| `FB` | `false` | spoof/blocked-browser flag |
| `JSF` | `Arial,Courier,…` | fonts detected by measurement |
| `P` | `Chrome PDF Viewer,…` | `navigator.plugins` names |
| `T` | `0,false,false` | `maxTouchPoints`, + touch flags (patched 5 → `5,false,true`) |
| `H` | `12` | `navigator.hardwareConcurrency` |
| `SWF` | `false` | Flash present |

The bundle appends `fb: 1` to the BDA when any of `FOS/FB/FR` is set — i.e. it
self-declares a "fake/spoofed browser" signal to the server.

## `enhanced_fp` — 91 entries

Grouped; entries marked † are still unnamed (behaviour probed, source not
isolated). Values are from the baseline run on this machine.

**GPU / WebGL (19):** `webgl_extensions`, `webgl_extensions_hash`,
`webgl_renderer`, `webgl_vendor`, `webgl_version`,
`webgl_shading_language_version`, `webgl_aliased_line_width_range`,
`webgl_aliased_point_size_range`, `webgl_antialiasing`, `webgl_bits`,
`webgl_max_params`, `webgl_max_viewport_dims`, `webgl_unmasked_vendor`,
`webgl_unmasked_renderer`, `webgl_vsf_params`, `webgl_vsi_params`,
`webgl_fsf_params`, `webgl_fsi_params`, `webgl_hash_webgl`.
Params read: `VENDOR 0x1F00, RENDERER 0x1F01, VERSION 0x1F02, GLSL 0x8B8C,
MAX_TEXTURE_SIZE 0x0D33, ALIASED_LINE_WIDTH_RANGE 0x846E, ALIASED_POINT_SIZE_RANGE
0x846D, MAX_VIEWPORT_DIMS 0x0D3A, MAX_VERTEX_ATTRIBS 0x8869, MAX_VERTEX_UNIFORM_VECTORS
0x8DFB, MAX_FRAGMENT_UNIFORM_VECTORS 0x8DFD, MAX_VARYING_VECTORS 0x8DFC, MAX_COMBINED_TEXTURE_IMAGE_UNITS
0x8B4D, MAX_VERTEX_TEXTURE_IMAGE_UNITS 0x8B4C, MAX_TEXTURE_IMAGE_UNITS 0x8872, MAX_CUBE_MAP_TEXTURE_SIZE
0x851C, MAX_RENDERBUFFER_SIZE 0x84E8, UNMASKED_VENDOR 0x9245, UNMASKED_RENDERER 0x9246,
SCISSOR_BOX 0x0C10, VIEWPORT 0x0BA2, DEPTH_BITS 0x0D56, STENCIL_BITS 0x0D57,
SUBPIXEL_BITS 0x0D50`, plus `getSupportedExtensions()` and shader precision queries.
(`getExtension("WEBGL_debug_renderer_info")` is used — removing it did **not**
blank the unmasked strings, so they read the params directly.)

**Canvas / audio / media (8):** `audio_codecs`, `audio_codecs_extended_hash`,
`video_codecs`, `video_codecs_extended_hash` (both extended hashes move when
`MediaSource` is deleted → `isTypeSupported` probes), `audio_fingerprint`
(`OfflineAudioContext(1, 44100, 44100)` summed → `124.04347527516074`),
`math_fingerprint`, `supported_math_functions`, `media_query_dark_mode`.

**CSS media queries (2):** `f9bf2db` =
`{pc,ah,ap,p,h,u,prm,prt,s,fc}` → prefers-color-scheme, any-hover, any-pointer,
pointer, hover, update, prefers-reduced-motion, prefers-reduced-transparency,
scripting, forced-colors; plus `media_query_dark_mode`.

**Screen / window / device (12):** `screen_pixel_depth` (**= colorDepth × 3** —
24 → 72; patched 48 → 144), `navigator_device_memory` (32),
`navigator_languages`, `window_inner_width`, `window_inner_height`,
`window_outer_width`, `window_outer_height`, `3f76dd27` =
`screen.orientation.type`, `3ea7194` = `{supported,formats:["HDR10","HLG"],isHDR}`,
`basfas` = `performance.memory` → `[0, usedJSHeapSize]` (patched → `[0,1]`),
`862f2c1` = `4`†, `5dd48ca0` = count of probed feature objects (deleting
`RTCPeerConnection` → 4).

**Network (4):** `navigator_connection_downlink`, `navigator_connection_downlink_max`,
`network_info_rtt`, `network_info_save_data`, `network_info_rtt_type`.

**UA / browser / headless (7):** `user_agent_data_brands`, `user_agent_data_mobile`,
`browser_detection_firefox`, `browser_detection_brave`,
`headless_browser_phantom`, `headless_browser_selenium` (flips with
`navigator.webdriver=true`), `headless_browser_nightmare_js`,
`browser_object_checks`.

**Frame & page context (9):** `document__referrer`, `window__location_href`,
`client_config__sitedata_location_href`, `client_config__language`,
`client_config__surl` (API origin), `client_config__triggered_inline`,
`client_config__wait_for_settings`, `is_keyless`, `mobile_sdk__is_sdk`.

> **`window__ancestor_origins`, `window__tree_index`, `window__tree_structure`**
> are real cross-origin frame-tree reconnaissance. Embedding the widget in an
> iframe on `http://127.0.0.1:PORT` produced
> `ancestor_origins:["http://127.0.0.1:PORT"]`, `tree_index:[0]`,
> `tree_structure:"[[]]"` — sourced from `location.ancestorOrigins` and the
> `window.parent` chain. This leaks the full referrer chain (merchant →
> iframe vendor → captcha) to Arkose without any permission prompt.

**Permissions / storage / misc (10):** `1f220c9` = MD5 of permission query
results (patching `permissions.query` to `denied` changed it), `7541c2s` =
`md5(JSON.stringify(enumerateDevices()))` (`[]` → `d7517139…`),
`c2d2015` = device-capability hash (deleting `DeviceOrientationEvent` changed it),
`a9e2b4c` = `[]`†, `43f2d94` = `[]`†, `20c15922` = `false`†, `4f59ca8` = `null`†,
`z87b89t5` = `null`†, `9f41a2c`/`5c273b3`/`ce4046e` = `false`†,
`f58835f` = hash†.

**Speech (2):** `speech_default_voice` (`"A || en-US"` once voices are
injected), `speech_voices_hash` (md5 of the voice list).

**Identifiers / build constants (6):**
`4b4b269e68` = **per-load session UUID**, identical to the `id` sent to
`/metrics/ui`, changes on every load;
`lfasdgs` = `ea52f7b4-74f7-49a1-a502-6b3141f59a30` — **hard-coded in the bundle**
(`E="ea52f7b4…"`), *not* a tracking ID; identical in fresh profiles and with
localStorage blocked;
`6a62b2a558`, `83eb055`, `05d3d24` = stable build/page hashes;
`c8480e29a` = `md5("https://client-api.arkoselabs.com") + U+2062`;
`29s83ih9` = `md5("false") + U+2063`.

**Decoys:** `c` (copyright), `vsadsa=1`, `867e25e5d4`/`d4a306884c` = `b64(";")`,
`43f2d94`/`a9e2b4c` empty arrays, `lfasdgs`/`basfas` junk names.

## Behavioural + timing

`4ca87df3d1` = base64 of 4 timing tuples, e.g.
`165,0,8,171;3571,0,31,18;3571,1,31,18;3571,2,31,18;` — changes on every run
(event-loop/CPU timing samples). `navigator_connection_downlink` is also
live-measured and jitters between runs.

## `jsbd` (blackbox side-channel state)

```json
{"HL":2,"NCE":true,"DT":"ark","NWD":"false","DMTO":1,"DOTO":1}
```
`HL` = `history.length` (patched → 9), `NCE` = `navigator.cookieEnabled`
(patched → false), `DT` = `document.title`, `NWD` =
`JSON.stringify(navigator.webdriver)`.

## Network calls (all before any challenge)

| call | contents |
|---|---|
| `GET /v2/<pk>/settings` | site config |
| `POST /fc/gt2/public_key/<pk>` | `c` (encrypted BDA above), `public_key`, `site`, `userbrowser`, `capi_version`, `capi_mode`, `style_theme`, `rnd` |
| `POST /metrics/ui` | **plaintext** telemetry: `device.platform`, `device.language`, `device.connection{effectiveType,rtt,downlink}`, `locationOrigin`, `locationPathname`, session `id`, per-stage timers (`apiExecute`, `settingsLoad`, `initFPCollection`, `fpProcessing`), `isLowPoweredDevice`, and the error object (`API_REQUEST_ERROR`, status 400) |

`metrics/ui` is the only unencrypted exfiltration path — it confirms platform,
language, connection class, origin/path and the exact failure reason, even when
the encrypted BDA is rejected.

## What this means for a merchant

- The BDA is a **rich fingerprint** (~90 signals) plus canvas/audio/WebGL/math
  digests, frame-tree reconnaissance, and a **self-integrity layer** (`f`,
  `ife_hash`, `wh`) that flags modified clients.
- It is **origin-bound**: replaying or re-encrypting `c` from another origin
  fails `400 DENIED ACCESS`, so the encryption is not the only control.
- Nothing in the flow proves the human is a human — it proves the *client* looks
  like a stock browser. Headless/patch signals are advisory booleans
  (`headless_browser_*`, `FOS/FB/FR`), not a proof.
- The persistent-looking `lfasdgs` UUID is a **constant**, so it cannot be used
  for cross-site tracking; the only per-load identifier is the metrics session id.
