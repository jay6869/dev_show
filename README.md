# HEXACHORD

_An instrument in six movements._ A single-page audiovisual piece with no portfolio, no about page and no contact form: the site is the work. You scroll through six movements that each have their own shader, typography and scale, and in the fifth movement you play it.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck (app + node config) -> vite build -> dist/ (+ .gz)
npm run preview    # serve dist/
npm run lint       # ESLint, typescript-eslint strictTypeChecked
npm run typecheck
```

Requires Node 20.19+ (built and tested on Node 26).

---

## 0. Direction

**Three concepts considered**

1. **Signal / Noise.** A radio telescope slowly resolves a transmission out of static. Strong premise, but the arc is a single reveal, so it runs out after one idea.
2. **Tidewater.** An ocean in six states, from ice to storm. Lovely, but it pulls toward literal environment art, and that competes with the type.
3. **Hexachord (chosen).** The hexachord is Guido d'Arezzo's six-note scale (_ut re mi fa sol la_), and medieval theory called the move from one hexachord to another a **mutation**. That gives six movements, six-note scales, and a real word for the transitions. Every structural choice has a musical reason, so the audio can't feel bolted on: the concept is sound.

**Creative direction.** Cold, precise, cinematic; an instrument panel as much as a stage. Near-black void, off-white ink, one acid accent that means _signal_. The display face strains along a width axis, and mono type reads the data. Sound is a generative pad that glides between hexachords with voice-leading, never a loop. The visuals are one particle field, 262,144 points on the high tier, that never gets cut: it is born, organised, melted, refracted, played and finally put out.

**Screenshot moments.** (1) The title forming out of a single point, then dissolving into a nebula as you start to scroll. (2) The quartz crystal in IV splitting white particle light into a spectrum. (3) Playing the nine particle strings in V, keys A–L, while the piece answers.

**Top risks → mitigations**

| Risk | Mitigation |
| --- | --- |
| Fill-rate on 262k additive points at DPR 2 | Adaptive tiers (512² → 256² → 160²), DPR clamp, point size tied to focal length, not raw pixels |
| Raymarch cost | Bounding-sphere early-out, compile-time step count per tier, 0.3–0.5 internal resolution + Catmull-Rom upsample |
| Audio blocked or clipped | Silent-buffer unlock inside the gesture; Tone lazy-loaded; compressor → limiter −1 dB; note throttling |
| Photosensitivity with audio-reactive visuals | Symmetric ~0.25 s smoothing at the analyser; bursts capped under 3/s; bursts refract rather than brighten |
| Scroll-jacking | Native scroll only; smoothing lives in the scrub and damped values |

---

## 1. Movements

| # | Movement | Hexachord / chord | Visual language | Type treatment | Hidden interaction |
| --- | --- | --- | --- | --- | --- |
| I | Emergence | _naturale_ · C | Born from one point into the particle title, which dissolves into a curl-noise nebula | h1 is DOM; the giant title is decorative glyph particles | **Singularity**: long-press for 1.2 s and the field implodes into your finger, then re-emerges |
| II | Tension | Whole-tone · C | Rigid particle lattice in front of a deformable grid; the pointer is a mass, the strain is a load | Anybody's width axis strains per character, crushed under the pointer | **Snap**: type `snap` and the lattice releases like a cut cable |
| III | Liquid | _molle_ · F | Raymarched SDF: six metaballs (one per note) + your pointer blob, soft shadows + AO, spray vortex | Letters float on the surface | **Whirlpool**: drag a full circle to stir a fluid vortex; the blobs merge |
| IV | Crystal | Lydian · D | Hexagonal quartz and six shards; six-band spectral refraction of the live frame; thin-film iridescence | Live IOR readout (n<sub>R</sub>, n<sub>G</sub>, n<sub>B</sub>) | **Shatter**: shake the pointer and the facets separate |
| V | Instrument | _durum_ · G | Nine particle strings with standing waves; refractive burst rings | Note name follows the cursor; keys light under strings | **Canon**: pluck six ascending strings and the piece answers |
| VI | Afterglow | Aeolian · A | Everything decays into an ember and a faint ring; the post chain winds down | Centred, small, nearly gone | **Da capo**: hold the last light for 2 s and it flies home (MotionPath) as the piece rewinds |

The Director's Cut lists the six secrets as blurred hints that come into focus on hover or focus.

---

## 2. Stack rationale

- **Vite 8 (Rolldown)** with TypeScript `strict`, `noUncheckedIndexedAccess` and `noImplicitOverride`. TypeScript is pinned to **6.0** because typescript-eslint doesn't support TS 7 yet.
- **Three.js r186**, used only for its renderer, render targets and scene graph. Every hero material is a hand-written `ShaderMaterial`.
- **GSAP 3.15**: ScrollTrigger, SplitText, Flip, CustomEase, MotionPath, plus ScrambleText, which is also GSAP and free.
- **Tone.js 15**, loaded with a dynamic `import()` only after the visitor opts into sound.
- **No Lenis.** Native scroll keeps momentum, find-in-page, anchors, keyboard and assistive tech exactly as the platform intends. Smoothing lives in the ScrollTrigger scrub (0.9 s) and in frame-rate-independent `damp()`.
- No other runtime dependencies. Dev only: vite-plugin-glsl, vite-plugin-compression, ESLint, Prettier.

---

## 3. Architecture

```
index.html ← rendered at build time from src/content/copy.ts (real HTML, works with no JS)
   │
main.ts → core/App (composition root)
   │
   ├─ core/Ticker ─── the ONE loop (gsap.ticker). Fixed order per frame:
   │     input   Pointer.update · Scroll.update
   │     state   Idle · Instrument · Secrets
   │     audio   AudioEngine.update (chord turns, riser, analyser)
   │     render  World.update → sim → fluid → scenes → render → post
   │     ui      Cursor · Nav · Sections · Meta(favicon/title) · DirectorsCut
   │     stats   Quality monitor · dev Stats
   │
   ├─ core/Timeline ── master gsap timeline, labels m0..m5, built from factories:
   │     hold(i)      per-movement evolution (e.g. strain rising in II)
   │     mutation(i)  movement i → i+1 (layers exit early/accelerating, enter late/decelerating,
   │                  morph + camera on the one "mutate" curve)
   │     ScrollTrigger scrubs it 1:1 against the document (6 sections = 6 units)
   │
   ├─ gl/World ─────── camera path (CatmullRomCurve3 ×2), pointer ray, WorldContext for scenes
   │     gpgpu/ParticleSim   FBO ping-pong (position + velocity RTs, float), 7 target DataTextures
   │     fluid/FluidSim      stable fluids: splat → curl → vorticity → divergence → Jacobi → gradient → advect
   │     scenes/*            Emergence (static) · Tension, Liquid, Crystal, Instrument, Afterglow (streamed)
   │     postfx/PostFX       scene HDR RT → [crystal refraction copy] → dual-Kawase bloom → final composite
   │
   ├─ audio/  Sound (consent, persistence, lazy load) · AudioEngine (Tone graph) ·
   │          AnalyserBridge (levels → uniforms) · Instrument (V, works silent too)
   └─ ui/     Preloader · EntryGate · Nav · Cursor · Sections · Captions · Meta · Idle · Secrets ·
              DirectorsCut (lazy) · Stats (dev only)
```

**Rules held:** one canvas, one renderer, one loop (the resize handler only sets a flag that the ticker flushes). Every class that owns GPU resources, audio nodes, listeners, ScrollTriggers or timelines has a `dispose()`, and `App.dispose()` unwinds all of them, which HMR uses. There is no `any`, uniforms are typed at their owners, and the Store has a typed event map.

**Rendering per frame:** raymarch (if III is visible) → main scene into an HDR half-float target → if IV is visible, copy the target so the crystal can sample what's behind it, then draw the crystal → bloom mips → final pass to the canvas.

---

## 4. Design tokens (`src/styles/tokens.css`)

**Colour.** Ratios are measured against `--c-void` and computed live in the Director's Cut.

| Token | Hex | Contrast | Use |
| --- | --- | --- | --- |
| `--c-void` | `#08090B` | n/a | Base |
| `--c-ink` | `#ECE9E2` | 16.43:1 (AAA) | Text |
| `--c-accent` | `#D4FF3F` | 17.24:1 (AAA) | Signal: current state, focus, the one accent |
| `--c-dim` | `#8B9099` | 6.21:1 (AA) | Secondary labels, data |
| `--c-rule` | `#5E636B` | 3.29:1 | Hairlines and non-text UI only (WCAG 1.4.11) |

**Type.** Anybody (variable, width 50–150, weight 100–900) for display, and JetBrains Mono (variable) for labels and data. Both are self-hosted Latin-subset woff2 files, preloaded. _Anybody gets the display role because tension needs an axis to strain along: its width axis is literally driven by the same strain uniform as the grid. JetBrains Mono gets the data because an instrument panel reads in fixed width, and it keeps the numbers from jittering while they change._ The fluid scale runs from a perfect fourth (1.333) at 360 px to a perfect fifth (1.5) at 1600 px, so the type scale is itself a chord.

**Space.** An 8pt grid (`--s-1`…`--s-9`), 12 columns, and fluid `--gutter` and `--margin`. Hit targets are at least 44 px.

**Motion.** Named durations are `instant` 90 ms, `fast` 180, `base` 360, `slow` 720 and `cinematic` 1440. Named easings live in `src/utils/easing.ts` (CustomEase) and are mirrored in CSS:

| Ease | Purpose |
| --- | --- |
| `enter` | Entrances decelerate: fast arrival, long settle |
| `exit` | Exits accelerate: things get pulled away, never just faded |
| `mutate` | Every movement transition: long hold, decisive turn, long settle |
| `magnet` | Magnetic UI, with a 6% overshoot |
| `breath` | Idle and pulse loops |
| `strike` | Instrument strikes: near-instant attack, long tail |
| `decode` | Scramble reveals: a stepped start, then a smooth resolve |

---

## 5. Motion principles

- **Scroll is the timeline.** One master timeline has labels, holds and mutations, and ScrollTrigger scrubs it. Titles are SplitText characters in masks: scrubbed entrances animate `yPercent`, and exits animate `y`, so the two timelines never own the same property.
- **Everything pointer-driven uses `quickTo` or `quickSetter`**, created once: the cursor, magnet targets, and per-character weight, width and float. No tween is created per `mousemove`.
- **Velocity is expressive.** Smoothed scroll velocity drives chromatic aberration, a type skew, the pad's filter and the reverb send.
- **Morphs pour instead of cross-fading.** Each particle has its own departure time (a seeded stagger), and the spring relaxes mid-flight so the curl field carries particles between shapes.
- **Nothing sits still.** Each movement's hold timeline evolves (strain builds, the afterglow decays), and after 8 s of no input the piece plays itself with a generative Lissajous gesture that also plays notes in V.

---

## 6. Audio design

- **Chain:** sources → pad filter → chorus → reverb send / dry → master Gain → Compressor → Limiter (−1 dB) → out. Every gain change is a ramp.
- **Pad:** four FatOscillator voices (a triangle bass voice plus three detuned sawtooths). At each movement's _turn_, the midpoint of its mutation, each voice glides to its nearest note in the new chord over 2.6 s (voice-leading). Detune spread, chorus depth and level come from the movement's palette (`audio/palette.ts`).
- **Scroll coupling:** velocity opens the low-pass filter and dries the reverb, and stillness blooms it back.
- **Riser:** pink noise through a band-pass whose gain and centre frequency are a function of your _distance to the next turn_, so it can't drift out of sync with the visuals. It's silent when you're parked and cut at the turn.
- **Sub:** a sine that drops an octave into the new root exactly at the turn.
- **Instrument (V):** six Karplus-Strong plucks round-robin, plus a quiet FM "glass" layer an octave up. Pointer X picks a string, quantised to the G hexachord, so nothing can sound wrong. Pointer Y sets brightness through the pluck damping, FM index and filter. Notes are throttled to 40 ms apart and at most 16 per second.
- **Analyser:** FFT 512 plus a 256-sample waveform. Bass drives the particle pulse and bloom, highs drive grain, shimmer and crystal dispersion. Levels are smoothed symmetrically (about 0.25 s time constant) before they reach any visual, so audio-reactive brightness can't modulate faster than about 1 Hz.
- **Consent:** audio is OFF until the gate. Tone is only fetched after "Enter with sound" or the Sound button. The choice is remembered, but a fresh gesture is still required. Audio fades and suspends when the tab is hidden, and `M` mutes. Turning sound on is animated both ways: a filter bloom and sub swell, matched by a visual "wake" (bloom, point size, exposure).
- **Captions:** a visible sound caption describes each chord change for deaf and hard-of-hearing visitors.

---

## 7. Technique notes

- **GPGPU:** position and velocity float render targets, each double-buffered. Velocity integrates the target spring (morph between the two bracketing target textures), divergence-free curl noise (cross product of two analytic simplex gradients: 2 noise evaluations instead of 18), pointer repel and drag, fluid velocity sampled at each particle's projected screen position, bass pressure, and secret envelopes. Particles are drawn as points whose size follows the projection, with thin-lens depth of field whose alpha falls with the circle of confusion's area, so energy is conserved.
- **SDF:** smooth-min metaballs, Quilez's improved soft shadows, 5-tap AO, a studio environment function, and a bounding-sphere early-out. It renders at 0.3–0.5× resolution and is upsampled with a 5-tap Catmull-Rom filter.
- **Crystal:** six IORs, six taps of the copied frame, re-integrated to RGB with spectral band weights. Facet edges come from barycentrics and `fwidth`, so they stay 1.2 px wide at any distance.
- **Post, hand-written:** a Karis-weighted soft-knee prefilter, dual-Kawase down/up bloom (the mip count adapts to viewport size), then one final pass doing fluid displacement → burst rings (refraction, not flashes) → lens → radial CA scaled by scroll velocity → ACES → vignette → sRGB → luminance-aware grain → triangular dither. Every effect is a scalar uniform, so tiers and reduced motion zero them without recompiling.
- **Fluid:** screen-space stable fluids with vorticity confinement and reflective boundaries; velocity only, no dye.

---

## 8. Accessibility

- Real semantic sections, headings and copy, rendered at build time, so the piece reads fully with **no JS** and **no WebGL** (a styled CSS-gradient fallback). A 12-second boot watchdog guarantees it's never a blank page.
- `prefers-reduced-motion`: no scrubbed camera (cuts happen through a fade to void), no fluid displacement, CA, lens, bursts, idle mode or char animation; particles drift at 25% curl; transitions become fades.
- No flashing above 3 Hz anywhere (see Audio → Analyser; bursts are capped at 3/s and are refractive).
- **Keyboard:** skip link; the gate is a real modal (focus trap, remembered choice pre-focused, Esc = silent); ←/→ and PageUp/PageDown move between movements (↑/↓ stay native scroll); A–L play in V (Shift+D opens the Director's Cut there, since D is a string); `D` elsewhere; `M` mute; Esc closes overlays; designed `:focus-visible` rings; focus is handed to the first heading after the gate.
- Canvas `aria-hidden`; a live region announces each movement; sound captions are visible; the cursor is fine-pointer only (hidden in forced-colours mode); touch targets are ≥ 44 px; no hover-only features.

---

## 9. Performance and bundle

Production build (`npm run build`), gzip:

| Chunk | Loaded | gzip |
| --- | --- | --- |
| three | initial | 133.0 KB |
| gsap (+ 6 plugins) | initial | 68.3 KB |
| app: `main` + shared `targets` chunk | initial | 21.0 + 11.3 KB |
| **Initial JS total** | | **233.6 KB** (budget 300) |
| CSS | initial | 6.4 KB |
| tone | after opt-in | 64.7 KB |
| Tension / Liquid / Crystal / Instrument / Afterglow scenes | streamed after entry | 1.1 / 3.3 / 2.3 / 0.3 / 0.2 KB |
| AudioEngine | after opt-in | 2.6 KB |
| Director's Cut | on first open | 3.8 KB |
| Fonts (2 variable woff2) | preloaded | 56 + 40 KB |

With Vite 8's Rolldown, chunking uses `codeSplitting.groups` (three, gsap, tone). The code shared between the page and the 404 entry is emitted automatically as the `targets` chunk.

**If it went over budget, what I'd cut, in order:** Flip (the nav marker could be done by hand, ~8 KB), ScrambleText (swap in a 40-line decoder, ~5 KB), MotionPath (only the Da capo flight uses it, ~8 KB), then move ScrollTrigger to after the gate.

**Adaptive quality** (`core/Quality.ts`): the device probe picks the initial tier, then a 90-frame rolling average drops a tier above 21 ms and climbs back once after 8 s under 11 ms. Tiers scale DPR (2 / 1.5 / 1), particles (262,144 / 65,536 / 25,600), raymarch scale and steps, fluid resolution and iterations, bloom mips, and shadows, CA and lens. Rendering pauses on hidden tabs, and time is clamped so nothing jumps on resume. WebGL context loss pauses, captions it, and rebuilds every GPU resource on restore.

**Measured:** in headless Firefox on a software renderer ("Intel HD Graphics, or similar"), the monitor dropped itself to the **low** tier and held about **58 fps (17.2 ms)**. No real-GPU, phone or Safari numbers have been measured yet; see below.

The dev-only stats overlay toggles with the backtick key (`` ` ``).

---

## 10. Verification log and deviations

**Verified** (headless Firefox 156 via puppeteer-core, production build): the full scroll through all six movements plus mid-transition frames; the sound path (Tone loads, captions appear, keys play, no console errors); the Director's Cut; the keyboard-only journey (gate trap, Esc, arrows, PageUp, Shift+D, Esc, focus hand-off); reduced motion; a 390×844 touch viewport; the 404; and simulated WebGL context loss and restore. `tsc`, `eslint` (strictTypeChecked) and `prettier` are clean.

**Not verified:** real GPUs at high and medium tiers, iOS Safari's audio unlock, real phones, and what the audio actually sounds like, since it hasn't been listened to.

**Deviations from the brief:**
- Pinning uses CSS `position: sticky`, and ScrollTrigger scrubs rather than pins. Sticky works without JS (the fallback) and is compositor-friendly, and there are no pin-spacer layout jumps.
- Arrow **Up/Down** keep native scrolling; movement navigation is on ←/→ and PageUp/PageDown.
- `D` is a string in movement V, so Shift+D opens the Director's Cut there.
- Tone gets its own context after an in-gesture silent-buffer unlock. Handing Tone a native `AudioContext` throws inside Tone 15 (`param must be an AudioParam`).
- The compression plugin emits gzip only; a second (brotli) instance silently emits nothing.
- Fonts are Fontsource's Latin-subset woff2 files, not re-subset with pyftsubset, which wasn't available.
- One debug handle, `window.__hx`, exists in dev builds only.

**Known limitation:** on the 25,600-particle low tier at narrow portrait widths, the particle title in I is readable but soft, because the point size approaches the glyph stroke width.
