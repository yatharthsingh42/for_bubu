/*==================================================================
  THE LIVING NIGHT SKY — script.js

  Pairs with the provided style.css (#world / #sky / #stars /
  #constellations / #moon / #mountains / #lake / #water /
  #reflection / #mist / #foreground / #left-tree / #right-tree /
  #intro / #begin).

  Architecture (four small "engines" sharing one State object):

    SkyEngine          stars, milky way, dust, rotation, meteors,
                        moon-glow influence, rare events
    ConstellationEngine hover-to-reveal constellations + memories
    WaterEngine         ripples, reflection, shimmer, sparkles
    AtmosphereEngine    fireflies, clouds, wind-driven mist
    WorldEngine         mouse parallax, audio sync, eclipse,
                        the "begin" sequence, the shared heartbeat

  Everything reads from one `State` object so the whole scene can
  "breathe" together (State.pulse), and react to one shared
  `State.wind` value.

  ---- QUICK CUSTOMIZATION -------------------------------------
  - CONFIG.title / CONFIG.subtitle        -> intro text
  - CONFIG.musicSrc                       -> path to a song (or "")
  - CONFIG.memories[]                     -> text revealed when a
                                              constellation is clicked
  - CONFIG.hiddenInitial                  -> the secret constellation
                                              shape (edit the points!)
  ------------------------------------------------------------------*/

(() => {
  "use strict";

  /*================================================================
    0. CONFIG
  ================================================================*/
  const CONFIG = {
    musicSrc: "assets/audio/ambience.mp3", // e.g. "song.mp3" — leave "" to skip audio sync

    starCounts: { tiny: 1300, medium: 250, bright: 40, hero: 8 },
    milkyWayStars: 900,
    dustCount: 140,

    rotationPeriodMs: 12 * 60 * 1000, // 12 minutes for a full sweep
    meteorMinGapMs: 18000,
    meteorMaxGapMs: 55000,

    fireflyCount: 60,
    fireflyHeartCycleMs: 26000, // fireflies gather into a heart roughly this often

    petalCount: 100,

    // The "wow" moment: when the fireflies finish gathering into a
    // heart, they burst into lanterns — each carrying one photo —
    // that drift up and settle among the stars. Replace the src
    // paths with your own images (put them in an assets/photos/
    // folder next to your HTML file) and write real captions.
    photos: [
      { src: "assets/photos/1.jpg", caption: "Where it all started" },
      { src: "assets/photos/2.jpg", caption: "When i realised how much you mean" },
      { src: "assets/photos/3.jpg", caption: "MY sleepy cat" },
      { src: "assets/photos/4.jpg", caption: "My favourite memory together" },
      { src: "assets/photos/5.jpg", caption: "SOOOOO Prettyy" },
      { src: "assets/photos/6.jpg", caption: "Wont forget this day ever" },
    ],
    lanternRiseDurationMs: 7000, // how long each lantern takes to float to its resting spot

    // Act two — scroll further and the scene settles onto a dock by
    // the water, with a few more photos hanging like fairy lights.
    // Same idea as the sky lanterns: swap in your own images/captions,
    // add or remove entries freely, and rewrite the title/subtitle.
    dockPhotos: [
      { src: "assets/photos/dock1.jpg", caption: "Add a caption for this memory." },
      { src: "assets/photos/dock2.jpg", caption: "Add a caption for this memory." },
      { src: "assets/photos/dock3.jpg", caption: "Add a caption for this memory." },
      { src: "assets/photos/dock4.jpg", caption: "Add a caption for this memory." },
    ],
    act2Title: "and here's to everything still ahead",
    act2Subtitle: "— edit this line to say whatever you want her to read here.",

    // The moon is clickable. Clicking it cracks the sky wide open into
    // a second, deeper sky: a chaotic bloom of thousands of stars and
    // color that explodes outward, storms across the screen, and then
    // slowly, gravity-like, gathers itself into one enormous constellation
    // — a heart built entirely out of starlight — and rests there,
    // breathing, for as long as she wants to look at it. No words.
    // This IS the message.
    celestialBloom: {
      burstCount: 340, // particles in the initial explosion
      fieldStarCount: 520, // dense background starfield inside the portal
      shapePointCount: 150, // stars that travel to form the heart outline
      fillerStarCount: 90, // soft cluster of stars scattered inside the heart
      shapeSize: 0.34, // heart width as a fraction of the smaller viewport dimension
      shapeCenter: { x: 0.5, y: 0.47 }, // normalized position of the heart's center
    },
    scrollSensitivity: 0.0009, // how far one wheel/swipe tick moves the journey along

    entranceDurationMs: 5200, // how long the "sky waking up" takes
    zoomPeriodMs: 30000, // whole-scene breathing zoom, one cycle
    zoomAmplitude: 0.0075, // scale oscillates between 1 and 1+2*amp

    // Memories shown when the visitor clicks a fully-revealed
    // constellation. Edit freely — these are placeholders.
    memories: [
      "Add your first memory here — a line is enough.",
      "Add a second memory here.",
      "Add a third memory here.",
      "Add a fourth memory here.",
    ],

    // The secret constellation. Points are normalized (0-1) screen
    // positions describing a simple "O" — replace with real
    // initials by editing these points (and connections below).
    hiddenInitial: {
      name: "hidden",
      cx: 0.5,
      cy: 0.32,
      points: (() => {
        const pts = [];
        const n = 10;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          pts.push({ x: 0.5 + Math.cos(a) * 0.035, y: 0.32 + Math.sin(a) * 0.05 });
        }
        return pts;
      })(),
    },
  };

  /*================================================================
    1. UTILS
  ================================================================*/
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

  function injectStyles() {
    const css = `
      #stars, #constellations, #water, #fireflies-canvas {
        width: 100%; height: 100%; display: block;
      }
      .cloud {
        position: absolute; top: 0; left: 0;
        width: 340px; height: 120px; pointer-events: none;
        border-radius: 50%;
        background: radial-gradient(ellipse, rgba(230,238,250,.55), transparent 70%);
        filter: blur(18px);
        opacity: 0;
        will-change: transform, opacity;
        z-index: 6;
      }
      #fireflies-canvas {
        position: absolute; inset: 0; pointer-events: none; z-index: 9;
      }
      #petals-canvas {
        position: absolute; inset: 0; pointer-events: none; z-index: 13;
      }
      #stardust-canvas {
        position: absolute; inset: 0; pointer-events: none; z-index: 19;
      }
      .memory-panel {
        position: absolute;
        left: 50%; top: 50%;
        transform: translate(-50%, -46%);
        max-width: 480px;
        padding: 34px 40px;
        border-radius: 18px;
        background: rgba(5, 10, 18, 0.72);
        border: 1px solid rgba(255, 216, 156, 0.25);
        box-shadow: 0 25px 80px rgba(0,0,0,.55), 0 0 60px rgba(255,216,156,.08);
        color: var(--text, #F8F3EA);
        font-family: "Cormorant Garamond", serif;
        font-size: 1.35rem;
        line-height: 1.7;
        letter-spacing: .3px;
        text-align: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity .8s ease, transform .8s ease;
        z-index: 30;
      }
      .memory-panel.visible {
        opacity: 1;
        transform: translate(-50%, -50%);
        pointer-events: auto;
      }
      .memory-panel .close-hint {
        display: block;
        margin-top: 18px;
        font-family: "Inter", sans-serif;
        font-size: .7rem;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: var(--muted, #CFC6B7);
        opacity: .6;
      }
      .memory-panel img {
        max-width: 100%;
        border-radius: 10px;
        margin-bottom: 16px;
        box-shadow: 0 10px 30px rgba(0,0,0,.4);
      }
      .lantern {
        position: absolute;
        width: 74px; height: 74px;
        left: 0; top: 0;
        z-index: 17;
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transition: opacity 1.4s ease;
      }
      .lantern.visible { opacity: 1; pointer-events: auto; }
      .lantern-glow {
        position: absolute; inset: -14px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255,216,156,.55), rgba(255,190,140,.15) 55%, transparent 75%);
        filter: blur(6px);
        animation: lanternPulse 3.6s ease-in-out infinite;
      }
      .lantern-photo {
        position: absolute; inset: 0;
        border-radius: 50%;
        background-size: cover;
        background-position: center;
        background-color: rgba(255,230,190,.12);
        border: 2px solid rgba(255, 230, 190, .85);
        box-shadow: 0 0 22px rgba(255, 200, 140, .45), inset 0 0 14px rgba(0,0,0,.25);
      }
      @keyframes lanternPulse {
        0%, 100% { opacity: .7; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.08); }
      }
      #world { cursor: default; transform-origin: 50% 50%; will-change: transform; }
      #world.sky-interactive #sky { cursor: crosshair; }
      .aurora-overlay {
        position: absolute; inset: 0;
        pointer-events: none;
        opacity: 0;
        mix-blend-mode: screen;
        background: linear-gradient(180deg,
          rgba(120, 255, 200, .10) 0%,
          rgba(140, 200, 255, .06) 35%,
          transparent 70%);
        transition: opacity 3s ease;
        z-index: 3;
      }
      .vignette-overlay {
        position: absolute; inset: 0;
        pointer-events: none;
        z-index: 15;
        background: radial-gradient(ellipse at 50% 46%,
          transparent 38%,
          rgba(0, 2, 6, 0.22) 72%,
          rgba(0, 1, 4, 0.62) 100%);
        opacity: 0;
        transition: opacity 2.4s ease;
      }
      .vignette-overlay.revealed { opacity: 1; }

      /* -- entrance sequence -- */
      #moon {
        opacity: 0;
        transition: opacity 3.2s ease;
      }
      #moon.revealed { opacity: 1; }

      #intro {
        opacity: 0;
        transform: translateY(26px);
        transition: opacity 2s ease, transform 2s ease;
      }
      #intro.revealed { opacity: 1; transform: translateY(0); }

      /* -- scroll hint -- */
      #scroll-hint {
        position: absolute;
        left: 50%;
        bottom: 34px;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        color: var(--muted, #CFC6B7);
        font-family: "Inter", sans-serif;
        font-size: .68rem;
        letter-spacing: 3px;
        text-transform: uppercase;
        opacity: 0;
        transition: opacity 1s ease;
        z-index: 20;
        pointer-events: none;
      }
      #scroll-hint .chevron {
        width: 9px; height: 9px;
        border-right: 1px solid var(--muted, #CFC6B7);
        border-bottom: 1px solid var(--muted, #CFC6B7);
        transform: rotate(45deg);
        animation: hintBounce 2.2s ease-in-out infinite;
      }
      @keyframes hintBounce {
        0%, 100% { transform: rotate(45deg) translate(0,0); opacity: .5; }
        50% { transform: rotate(45deg) translate(4px,4px); opacity: 1; }
      }

      /* -- act two: the dock -- */
      #act-two {
        position: fixed;
        inset: 0;
        z-index: 25;
        overflow: hidden;
        opacity: 0;
        will-change: transform, opacity;
        background:
          radial-gradient(ellipse at 50% 0%, rgba(120,90,160,.15), transparent 60%),
          linear-gradient(to bottom, #050810 0%, #0B1524 45%, #142943 100%);
      }
      #act-two-sky {
        position: absolute; inset: 0;
        opacity: .8;
        background-image:
          radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,.7), transparent),
          radial-gradient(1px 1px at 60% 15%, rgba(255,255,255,.5), transparent),
          radial-gradient(1.5px 1.5px at 80% 40%, rgba(255,255,255,.6), transparent),
          radial-gradient(1px 1px at 35% 55%, rgba(255,255,255,.4), transparent),
          radial-gradient(1px 1px at 90% 20%, rgba(255,255,255,.55), transparent),
          radial-gradient(1px 1px at 10% 65%, rgba(255,255,255,.45), transparent);
      }
      #dock {
        position: absolute;
        bottom: 0; left: 50%;
        transform: translateX(-50%);
        width: 520px; max-width: 90vw; height: 38%;
        background: linear-gradient(to top, #05070C, #101A26);
        clip-path: polygon(30% 100%, 38% 20%, 62% 20%, 70% 100%);
        opacity: .9;
      }
      #boat {
        position: absolute;
        bottom: 9%; left: 26%;
        width: 130px; height: 42px;
        background: linear-gradient(to top, #04060A, #0D1720);
        border-radius: 0 0 60px 60px / 0 0 26px 26px;
        opacity: .85;
        animation: boatBob 5s ease-in-out infinite;
      }
      @keyframes boatBob {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        50% { transform: translateY(-4px) rotate(-1.2deg); }
      }
      #lantern-string {
        position: absolute;
        top: 10%; left: 10%;
        width: 80%; height: 20%;
        overflow: visible;
      }
      .dock-lantern {
        position: absolute;
        width: 52px; height: 52px;
        transform: translate(-50%, -50%);
        cursor: pointer;
      }
      .dock-lantern .lantern-glow {
        position: absolute; inset: -10px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255,216,156,.5), transparent 70%);
        filter: blur(5px);
        animation: lanternPulse 3.2s ease-in-out infinite;
      }
      .dock-lantern .lantern-photo {
        position: absolute; inset: 0;
        border-radius: 50%;
        background-size: cover;
        background-position: center;
        background-color: rgba(255,230,190,.12);
        border: 2px solid rgba(255,230,190,.85);
        box-shadow: 0 0 18px rgba(255,200,140,.4), inset 0 0 10px rgba(0,0,0,.25);
      }
      #act-two-text {
        position: absolute;
        left: 50%; bottom: 15%;
        transform: translateX(-50%);
        text-align: center;
        color: var(--text, #F8F3EA);
        max-width: 520px;
        padding: 0 20px;
      }
      #act-two-text h2 {
        font-family: "Cormorant Garamond", serif;
        font-weight: 500;
        font-size: clamp(1.6rem, 4vw, 2.6rem);
        margin-bottom: 14px;
      }
      #act-two-text p {
        font-family: "Inter", sans-serif;
        color: var(--muted, #CFC6B7);
        font-size: .95rem;
        line-height: 1.7;
      }
      #moon.portal-ready {
        cursor: pointer;
      }
      .moon-portal {
        position: fixed;
        inset: 0;
        z-index: 60;
        overflow: hidden;
        background:
          radial-gradient(circle at var(--portal-x,50%) var(--portal-y,50%), rgba(20,26,42,.98) 0%, rgba(2,5,11,.99) 68%);
        clip-path: circle(0% at var(--portal-x,50%) var(--portal-y,50%));
        transition: clip-path 1.6s cubic-bezier(.65,0,.35,1);
        opacity: 0;
        pointer-events: none;
        cursor: pointer;
      }
      .moon-portal.open {
        opacity: 1;
        pointer-events: auto;
        clip-path: circle(150% at var(--portal-x,50%) var(--portal-y,50%));
      }

      /* -- nebula: layered, slowly-drifting blurred color fields that
         give the portal an "extremely pretty background" independent
         of the particle canvas — cheap on the GPU since it's pure CSS. */
      .moon-portal-nebula {
        position: absolute;
        inset: -10%;
        z-index: 1;
        opacity: 0;
        transition: opacity 3s ease .3s;
        mix-blend-mode: screen;
      }
      .moon-portal.open .moon-portal-nebula { opacity: 1; }
      .nebula-blob {
        position: absolute;
        border-radius: 50%;
        filter: blur(70px);
        opacity: .55;
        will-change: transform;
      }
      .nebula-blob:nth-child(1) {
        width: 60vw; height: 60vw;
        top: -8%; left: -12%;
        background: radial-gradient(circle, rgba(200,140,255,.55), transparent 70%);
        animation: nebulaDrift1 46s ease-in-out infinite;
      }
      .nebula-blob:nth-child(2) {
        width: 55vw; height: 55vw;
        bottom: -14%; right: -10%;
        background: radial-gradient(circle, rgba(255,150,190,.5), transparent 70%);
        animation: nebulaDrift2 55s ease-in-out infinite;
      }
      .nebula-blob:nth-child(3) {
        width: 46vw; height: 46vw;
        top: 30%; right: 8%;
        background: radial-gradient(circle, rgba(120,180,255,.4), transparent 72%);
        animation: nebulaDrift3 38s ease-in-out infinite;
      }
      .nebula-blob:nth-child(4) {
        width: 40vw; height: 40vw;
        bottom: 10%; left: 6%;
        background: radial-gradient(circle, rgba(255,216,156,.4), transparent 72%);
        animation: nebulaDrift1 62s ease-in-out infinite reverse;
      }
      @keyframes nebulaDrift1 {
        0%, 100% { transform: translate(0,0) scale(1); }
        50% { transform: translate(4%, 6%) scale(1.12); }
      }
      @keyframes nebulaDrift2 {
        0%, 100% { transform: translate(0,0) scale(1); }
        50% { transform: translate(-5%, -4%) scale(1.08); }
      }
      @keyframes nebulaDrift3 {
        0%, 100% { transform: translate(0,0) scale(1); }
        50% { transform: translate(-6%, 5%) scale(1.15); }
      }

      .moon-portal-stars {
        position: absolute;
        inset: 0;
        overflow: hidden;
        z-index: 2;
      }
      .moon-portal-streak {
        position: absolute;
        top: -20%;
        width: 2px;
        opacity: 0;
        animation: portalStreak linear infinite;
      }
      @keyframes portalStreak {
        0% { transform: translateY(-40%) scaleY(.4); opacity: 0; }
        12% { opacity: .8; }
        100% { transform: translateY(340%) scaleY(1.6); opacity: 0; }
      }

      /* -- the bloom canvas: everything alive (burst, storm, the
         heart made of stars) is drawn here -- */
      .moon-portal-canvas {
        position: absolute;
        inset: 0;
        z-index: 3;
        width: 100%;
        height: 100%;
        display: block;
      }

      /* soft dark vignette so the bloom reads as deep, not flat */
      .moon-portal-vignette {
        position: absolute;
        inset: 0;
        z-index: 4;
        pointer-events: none;
        background: radial-gradient(ellipse at var(--portal-x,50%) var(--portal-y,50%),
          transparent 30%, rgba(0,1,4,.28) 70%, rgba(0,1,4,.6) 100%);
      }

      /* -- orbit photos: once the heart locks, your photos rise up
         and take slow elliptical orbits around it, like little moons -- */
      .orbit-photo {
        position: absolute;
        width: 64px; height: 64px;
        left: 0; top: 0;
        z-index: 5;
        cursor: pointer;
        opacity: 0;
        transform: translate(-50%, -50%) scale(.4);
        transition: opacity 1.6s ease, transform 1.6s cubic-bezier(.34,1.56,.64,1);
        pointer-events: none;
      }
      .orbit-photo.visible {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
        pointer-events: auto;
      }
      .orbit-photo.hidden-finale { opacity: 0 !important; pointer-events: none; }
      .orbit-photo-glow {
        position: absolute; inset: -12px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255,193,217,.55), rgba(255,190,140,.15) 55%, transparent 75%);
        filter: blur(5px);
        animation: lanternPulse 3.2s ease-in-out infinite;
      }
      .orbit-photo-img {
        position: absolute; inset: 0;
        border-radius: 50%;
        background-size: cover;
        background-position: center;
        background-color: rgba(255,230,190,.12);
        border: 2px solid rgba(255, 216, 226, .9);
        box-shadow: 0 0 18px rgba(255, 180, 200, .5), inset 0 0 12px rgba(0,0,0,.25);
      }

      /* -- the tiny hint that tells her the heart can be touched -- */
      .portal-hint {
        position: absolute;
        left: 50%;
        bottom: 8%;
        transform: translateX(-50%);
        z-index: 5;
        color: var(--text, #F8F3EA);
        font-family: "Cormorant Garamond", serif;
        font-style: italic;
        font-size: 1.05rem;
        letter-spacing: 1px;
        opacity: 0;
        transition: opacity 1.6s ease;
        pointer-events: none;
        text-shadow: 0 0 20px rgba(255,216,200,.5);
      }
      .portal-hint.visible { opacity: .85; animation: hintFloat 3.5s ease-in-out infinite; }
      @keyframes hintFloat {
        0%, 100% { transform: translateX(-50%) translateY(0); }
        50% { transform: translateX(-50%) translateY(-6px); }
      }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  /*================================================================
    2. SHARED STATE
  ================================================================*/
  const State = {
    t0: performance.now(),
    now: performance.now(),
    dt: 0,
    elapsed: 0,

    pulse: 0, // -1..1 shared "breathing" value
    wind: 0.4, // 0..1 slowly wandering wind strength

    mouse: { x: -9999, y: -9999, tx: -9999, ty: -9999 },
    lakeMouse: { x: -9999, y: -9999, active: false },

    began: false,
    beganAt: 0, // timestamp of the "begin" click, for timed moments (e.g. the firefly heart)
    audioLevel: 0, // 0..1 music amplitude, if audio is wired up

    moonPos: { x: 0, y: 0, r: 140 }, // updated on resize, screen px
  };

  function updateSharedState(now) {
    State.dt = Math.min(64, now - State.now);
    State.now = now;
    State.elapsed = now - State.t0;

    // slow layered sine breathing for "worldPulse"
    const s = State.elapsed / 1000;
    State.pulse =
      Math.sin(s * (TAU / 8)) * 0.7 + Math.sin(s * (TAU / 19) + 1.3) * 0.3;

    // wind wanders slowly between two sine waves — never fully still
    State.wind = clamp(
      0.45 +
        Math.sin(s * (TAU / 47)) * 0.3 +
        Math.sin(s * (TAU / 133) + 2) * 0.18,
      0.05,
      1
    );

    // mouse smoothing
    State.mouse.x = lerp(State.mouse.x, State.mouse.tx, 0.08);
    State.mouse.y = lerp(State.mouse.y, State.mouse.ty, 0.08);
  }

  /*================================================================
    3. SKY ENGINE — stars, milky way, dust, rotation, meteors
  ================================================================*/
  const SkyEngine = (() => {
    let canvas, ctx, w, h;
    let pivot = { x: 0, y: 0 };
    let rotation = 0;
    let stars = []; // {angle, radius, size, color, tw, twSpeed, layer}
    let milkyway = [];
    let dust = []; // free-floating, not tied to rotation
    let meteors = [];
    let nextMeteorAt = 0;
    let rareOverlay = null; // aurora div
    let comet = null; // rare "ISS" style traveller

    const LAYER_COLORS = [
      "#FFFFFF", // white — most common
      "#DCE8FF", // blue-white
      "#FFE9C7", // warm ivory
      "#FFD3B0", // faint orange (rare)
    ];
    function pickColor() {
      const r = Math.random();
      if (r < 0.62) return LAYER_COLORS[0];
      if (r < 0.86) return LAYER_COLORS[1];
      if (r < 0.97) return LAYER_COLORS[2];
      return LAYER_COLORS[3];
    }

    // Hero/bright stars appear first, tiny stars trickle in latest —
    // gives the entrance a sense of the sky "waking up" rather than
    // every star popping in at once.
    const ENTRANCE_WINDOWS = {
      hero: [0, 900],
      bright: [200, 2000],
      medium: [500, 3600],
      tiny: [700, 1],
    };

    function makeStarSet(count, sizeRange, layer, alphaRange) {
      const out = [];
      const maxRadius = Math.hypot(w, h) * 0.85;
      const win = ENTRANCE_WINDOWS[layer] || [0, CONFIG.entranceDurationMs];
      const winEnd = layer === "tiny" ? CONFIG.entranceDurationMs : win[1];
      for (let i = 0; i < count; i++) {
        out.push({
          angle: rand(0, TAU),
          radius: rand(maxRadius * 0.05, maxRadius),
          size: rand(sizeRange[0], sizeRange[1]),
          color: pickColor(),
          baseAlpha: rand(alphaRange[0], alphaRange[1]),
          twPhase: rand(0, TAU),
          twSpeed: rand(0.4, 1.6),
          layer,
          appearAt: rand(win[0], winEnd),
          fadeLen: rand(500, 1100),
        });
      }
      return out;
    }

    function buildField() {
      pivot = { x: w * 0.5, y: -h * 0.15 };
      stars = [
        ...makeStarSet(CONFIG.starCounts.tiny, [0.5, 1.1], "tiny", [0.25, 0.55]),
        ...makeStarSet(CONFIG.starCounts.medium, [1.1, 1.8], "medium", [0.4, 0.75]),
        ...makeStarSet(CONFIG.starCounts.bright, [1.8, 2.6], "bright", [0.6, 0.9]),
        ...makeStarSet(CONFIG.starCounts.hero, [2.6, 3.6], "hero", [0.85, 1]),
      ];

      // Milky way: a diagonal band of dim stars, gaussian-scattered
      // perpendicular to the band direction, generated in the SAME
      // polar system so it rotates together with everything else.
      milkyway = [];
      const bandAngleStart = rand(0.15, 0.35) * TAU;
      const maxRadius = Math.hypot(w, h) * 0.85;
      for (let i = 0; i < CONFIG.milkyWayStars; i++) {
        const along = Math.random(); // position along the band
        const angle = bandAngleStart + along * 0.9; // sweep of the band
        const gauss = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        const radius = clamp(
          along * maxRadius + gauss * maxRadius * 0.09,
          20,
          maxRadius
        );
        milkyway.push({
          angle: angle + gauss * 0.05,
          radius,
          size: rand(0.4, 1),
          color: Math.random() < 0.85 ? "#FFFFFF" : "#DCE8FF",
          baseAlpha: rand(0.06, 0.22) * (1 - Math.abs(gauss) * 0.5),
          appearAt: rand(1400, CONFIG.entranceDurationMs + 1200),
          fadeLen: rand(1200, 2000),
        });
      }

      // Space dust — independent slow drift, screen-space, not polar
      dust = [];
      for (let i = 0; i < CONFIG.dustCount; i++) {
        dust.push({
          x: rand(0, w),
          y: rand(0, h),
          vx: rand(-0.02, 0.02),
          vy: rand(-0.01, 0.015),
          alpha: rand(0.01, 0.035),
        });
      }
    }

    function resize() {
      canvas.width = w = canvas.clientWidth * devicePixelRatio;
      canvas.height = h = canvas.clientHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      buildField();

      // moon screen position, matches CSS: width 280, top 55, right 70
      const moonEl = document.getElementById("moon");
      if (moonEl) {
        const r = moonEl.getBoundingClientRect();
        const worldR = document.getElementById("world").getBoundingClientRect();
        State.moonPos.x = r.left - worldR.left + r.width / 2;
        State.moonPos.y = r.top - worldR.top + r.height / 2;
        State.moonPos.r = r.width / 2;
      }
    }

    function drawStarShape(x, y, size, color, alpha, layer) {
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.fillStyle = color;

      if (layer === "tiny") {
        ctx.beginPath();
        ctx.arc(x, y, size * 0.5, 0, TAU);
        ctx.fill();
        return;
      }

      if (layer === "medium") {
        // small diamond
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-size * 0.55, -size * 0.55, size * 1.1, size * 1.1);
        ctx.restore();
        return;
      }

      // bright + hero: four-point sparkle
      const s = size * (layer === "hero" ? 2.6 : 1.8);
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = color;
      ctx.lineWidth = layer === "hero" ? 1.1 : 0.8;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(0, s);
      ctx.moveTo(-s, 0);
      ctx.lineTo(s, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.55, 0, TAU);
      ctx.fill();
      if (layer === "hero") {
        ctx.globalAlpha = alpha * 0.35;
        ctx.beginPath();
        ctx.arc(0, 0, size * 2.2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    function spawnMeteor() {
      const startX = rand(w * 0.1, w * 0.9);
      const startY = rand(0, h * 0.35);
      const angle = rand(0.55, 1.0); // downward-right sweep
      const speed = rand(7, 15);
      meteors.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: rand(60, 160),
        life: 1,
      });
    }

    function maybeSpawnComet() {
      if (comet || Math.random() > 0.15) return;
      comet = {
        x: -20,
        y: rand(h * 0.08, h * 0.3),
        vx: rand(1.2, 2.2),
        blink: 0,
      };
    }

    function drawRareEvents() {
      if (Math.random() < 0.0006 && !rareOverlay) {
        // aurora: brief green/blue wash, only occasionally
        rareOverlay = document.querySelector(".aurora-overlay");
        if (rareOverlay) {
          rareOverlay.style.opacity = "1";
          setTimeout(() => {
            if (rareOverlay) rareOverlay.style.opacity = "0";
          }, 9000);
          setTimeout(() => (rareOverlay = null), 13000);
        }
      }
      maybeSpawnComet();
      if (comet) {
        comet.x += comet.vx;
        comet.blink += 0.25;
        const flicker = 0.5 + Math.sin(comet.blink) * 0.5;
        ctx.globalAlpha = flicker;
        ctx.fillStyle = "#FFD89C";
        ctx.beginPath();
        ctx.arc(comet.x, comet.y, 1.6, 0, TAU);
        ctx.fill();
        if (comet.x > w + 20) comet = null;
      }
    }

    function entranceFactor(entity) {
      if (entity.appearAt === undefined) return 1;
      const t = (State.elapsed - entity.appearAt) / entity.fadeLen;
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      return Math.sin((t * Math.PI) / 2); // gentle ease-out fade in
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      rotation = (State.elapsed % CONFIG.rotationPeriodMs) / CONFIG.rotationPeriodMs * TAU;

      // -- milky way (behind everything) --
      for (const s of milkyway) {
        const ef = entranceFactor(s);
        if (ef <= 0) continue;
        const a = s.angle + rotation;
        const x = pivot.x + Math.cos(a) * s.radius;
        const y = pivot.y + Math.sin(a) * s.radius * 0.55 + h * 0.05;
        if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue;
        drawStarShape(x, y, s.size, s.color, s.baseAlpha * (0.85 + State.pulse * 0.15) * ef, "tiny");
      }

      // -- space dust (independent, drifting, wraps edges) --
      for (const d of dust) {
        d.x += d.vx * (0.4 + State.wind);
        d.y += d.vy * (0.4 + State.wind);
        if (d.x < 0) d.x += w;
        if (d.x > w) d.x -= w;
        if (d.y < 0) d.y += h;
        if (d.y > h) d.y -= h;
        ctx.globalAlpha = d.alpha;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(d.x, d.y, 1, 1);
      }

      // -- stars --
      const tsec = State.elapsed / 1000;
      for (const s of stars) {
        const ef = entranceFactor(s);
        if (ef <= 0) continue;
        const a = s.angle + rotation;
        const x = pivot.x + Math.cos(a) * s.radius;
        const y = pivot.y + Math.sin(a) * s.radius * 0.62 + h * 0.08;
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;

        // scintillation: more twinkle low on screen (near horizon)
        const horizonFactor = clamp(y / h, 0, 1);
        const twinkleAmp = 0.15 + horizonFactor * 0.55;
        const flicker =
          Math.sin(tsec * s.twSpeed + s.twPhase) * twinkleAmp +
          (Math.random() - 0.5) * horizonFactor * 0.12;

        // moon illumination: nearby stars wash out slightly
        const dm = dist(x, y, State.moonPos.x, State.moonPos.y);
        const moonInfluence = clamp(1 - dm / (State.moonPos.r * 2.6), 0, 1);

        let alpha = clamp(
          s.baseAlpha * (1 + flicker) + State.pulse * 0.04,
          0.03,
          1
        );
        alpha = (alpha * (1 - moonInfluence * 0.35) + moonInfluence * 0.12) * ef;

        drawStarShape(x, y, s.size, s.color, alpha, s.layer);
      }
      ctx.globalAlpha = 1;

      // -- meteors --
      if (State.began && State.now > nextMeteorAt) {
        spawnMeteor();
        nextMeteorAt = State.now + rand(CONFIG.meteorMinGapMs, CONFIG.meteorMaxGapMs);
      }
      meteors = meteors.filter((m) => m.life > 0);
      for (const m of meteors) {
        m.x += m.vx;
        m.y += m.vy;
        m.life -= 0.012;
        const tailX = m.x - m.vx * (m.len / Math.hypot(m.vx, m.vy));
        const tailY = m.y - m.vy * (m.len / Math.hypot(m.vx, m.vy));
        const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
        grad.addColorStop(0, `rgba(255,255,255,${clamp(m.life, 0, 1)})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
        if (m.x > w + 50 || m.y > h + 50) m.life = 0;
      }

      if (State.began) drawRareEvents();
    }

    function init() {
      canvas = document.getElementById("stars");
      ctx = canvas.getContext("2d");
      resize();
      window.addEventListener("resize", resize);
    }

    return { init, draw, get pivot() { return pivot; }, get rotation() { return rotation; } };
  })();

  /*================================================================
    4. CONSTELLATION ENGINE — hover to reveal, click for a memory
  ================================================================*/
  const ConstellationEngine = (() => {
    let canvas, ctx, w, h;
    let groups = [];
    let panel;

    const SHAPES = [
      // simple, elegant point-sets, normalized 0..1 (before rotation)
      [{x:.12,y:.18},{x:.17,y:.12},{x:.23,y:.16},{x:.21,y:.23},{x:.14,y:.24}],
      [{x:.82,y:.14},{x:.87,y:.20},{x:.84,y:.27},{x:.77,y:.25},{x:.78,y:.17}],
      [{x:.35,y:.72},{x:.4,y:.65},{x:.47,y:.68},{x:.5,y:.6}],
      [{x:.62,y:.42},{x:.68,y:.38},{x:.73,y:.44},{x:.69,y:.5},{x:.63,y:.48}],
    ];

    function buildGroups() {
      groups = SHAPES.map((shape, gi) => ({
        // convert each normalized point into the SAME polar system
        // SkyEngine uses, sampled at rotation = 0, so the group
        // rotates together with the rest of the sky.
        points: shape.map((p) => {
          const px = p.x * w;
          const py = p.y * h;
          const pivot = SkyEngine.pivot;
          const dx = px - pivot.x;
          const dy = (py - h * 0.08) / 0.62 - pivot.y;
          return { angle: Math.atan2(dy, dx), radius: Math.hypot(dx, dy) };
        }),
        reveal: 0,
        memory: CONFIG.memories[gi % CONFIG.memories.length],
      }));

      // the hidden initial — needs closer, more deliberate hovering
      const hp = CONFIG.hiddenInitial.points.map((p) => {
        const px = p.x * w;
        const py = p.y * h;
        const pivot = SkyEngine.pivot;
        const dx = px - pivot.x;
        const dy = (py - h * 0.08) / 0.62 - pivot.y;
        return { angle: Math.atan2(dy, dx), radius: Math.hypot(dx, dy) };
      });
      groups.push({ points: hp, reveal: 0, memory: null, hidden: true });
    }

    function currentPixelPoints(group) {
      const pivot = SkyEngine.pivot;
      const rotation = SkyEngine.rotation;
      return group.points.map((p) => {
        const a = p.angle + rotation;
        const x = pivot.x + Math.cos(a) * p.radius;
        const y = pivot.y + Math.sin(a) * p.radius * 0.62 + h * 0.08;
        return { x, y };
      });
    }

    function resize() {
      canvas.width = w = canvas.clientWidth * devicePixelRatio;
      canvas.height = h = canvas.clientHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      buildGroups();
    }

    function showMemory(text) {
      panel.textContent = "";
      const p = document.createElement("p");
      p.textContent = text;
      const hint = document.createElement("span");
      hint.className = "close-hint";
      hint.textContent = "click anywhere to close";
      panel.appendChild(p);
      panel.appendChild(hint);
      panel.classList.add("visible");
    }
    function hideMemory() {
      panel.classList.remove("visible");
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      if (!State.began) return;

      let anyClose = false;

      for (const g of groups) {
        const pts = currentPixelPoints(g);
        const proximityRadius = g.hidden ? 70 : 110;
        let minDist = Infinity;
        for (const pt of pts) {
          minDist = Math.min(minDist, dist(pt.x, pt.y, State.mouse.x, State.mouse.y));
        }
        const target = minDist < proximityRadius ? 1 : 0;
        g.reveal = lerp(g.reveal, target, g.hidden ? 0.02 : 0.05);
        if (target) anyClose = true;

        if (g.reveal < 0.02) continue;

        const alpha = g.hidden ? g.reveal * 0.65 : g.reveal;
        ctx.strokeStyle = `rgba(255, 216, 156, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.shadowColor = "rgba(255, 216, 156, .8)";
        ctx.shadowBlur = 6 * g.reveal;

        // progressively grow the line chain
        const segCount = Math.floor((pts.length - 1) * g.reveal);
        ctx.beginPath();
        for (let i = 0; i <= segCount && i < pts.length; i++) {
          const pt = pts[i];
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();

        ctx.shadowBlur = 0;
        for (let i = 0; i < pts.length; i++) {
          const pt = pts[i];
          const on = i <= segCount;
          ctx.globalAlpha = on ? clamp(0.5 + g.reveal * 0.5, 0, 1) : 0.15;
          ctx.fillStyle = "#FFE9C7";
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, on ? 1.8 : 1, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      document.getElementById("world").classList.toggle("sky-interactive", anyClose);
    }

    function handleClick(x, y) {
      for (const g of groups) {
        if (g.hidden || !g.memory) continue;
        if (g.reveal < 0.6) continue;
        const pts = currentPixelPoints(g);
        for (const pt of pts) {
          if (dist(pt.x, pt.y, x, y) < 40) {
            showMemory(g.memory);
            return true;
          }
        }
      }
      return false;
    }

    function init() {
      canvas = document.getElementById("constellations");
      ctx = canvas.getContext("2d");
      panel = document.createElement("div");
      panel.className = "memory-panel";
      document.getElementById("world").appendChild(panel);
      resize();
      window.addEventListener("resize", resize);

      document.getElementById("world").addEventListener("click", (e) => {
        if (panel.classList.contains("visible")) {
          hideMemory();
          return;
        }
        handleClick(e.clientX, e.clientY);
      });
    }

    return { init, draw };
  })();

  /*================================================================
    5. WATER ENGINE — ripples, reflection, shimmer, sparkles
  ================================================================*/
  const WaterEngine = (() => {
    let canvas, ctx, w, h, lakeEl;
    let ripples = [];
    let sparkles = [];
    let nextAmbientRippleAt = 0;

    function resize() {
      lakeEl = document.getElementById("lake");
      canvas.width = w = canvas.clientWidth * devicePixelRatio;
      canvas.height = h = canvas.clientHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      w = canvas.clientWidth;
      h = canvas.clientHeight;

      sparkles = [];
      for (let i = 0; i < 60; i++) {
        sparkles.push({
          x: rand(0, w),
          y: rand(0, h),
          phase: rand(0, TAU),
          speed: rand(0.6, 1.8),
        });
      }
    }

    function spawnRipple(x, y, strength = 1) {
      ripples.push({ x, y, radius: 1, alpha: 0.35 * strength, speed: rand(0.6, 1.1) });
    }

    function moonReflectionX() {
      // moon x is relative to #world; lake spans full width too,
      // so reuse the same x coordinate.
      return State.moonPos.x;
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      const tsec = State.elapsed / 1000;
      const shimmerAmp = 1.5 + State.wind * 2.5;

      // -- reflection column (moon), distorted per horizontal strip --
      const rx = moonReflectionX();
      const colWidth = 150;
      const rows = 40;
      for (let i = 0; i < rows; i++) {
        const y = (i / rows) * Math.min(h, 240);
        const rowT = i / rows;
        const offset =
          Math.sin(tsec * 1.4 + i * 0.6) * shimmerAmp * (1 - rowT) +
          Math.sin(tsec * 0.5 + i * 0.2) * shimmerAmp * 0.4;
        const alpha = (1 - rowT) * 0.16 * (0.7 + State.pulse * 0.3);
        ctx.fillStyle = `rgba(240, 245, 255, ${clamp(alpha, 0, 1)})`;
        const rowW = colWidth * (1 - rowT * 0.6);
        ctx.fillRect(rx - rowW / 2 + offset, y, rowW, h / rows + 1);
      }

      // -- sparkles --
      for (const s of sparkles) {
        const tw = Math.sin(tsec * s.speed + s.phase);
        if (tw < 0.6) continue;
        const near = clamp(1 - Math.abs(s.x - rx) / 220, 0, 1);
        ctx.globalAlpha = (tw - 0.6) * 2 * (0.15 + near * 0.5);
        ctx.fillStyle = "#EAF2FF";
        ctx.fillRect(s.x, s.y, 1, 1);
      }
      ctx.globalAlpha = 1;

      // -- ripples --
      if (State.began && State.now > nextAmbientRippleAt) {
        spawnRipple(rand(0, w), rand(h * 0.2, h), rand(0.3, 0.7));
        nextAmbientRippleAt = State.now + rand(2500, 6000) / (0.3 + State.wind);
      }
      ripples = ripples.filter((r) => r.alpha > 0.01);
      for (const r of ripples) {
        r.radius += r.speed * (0.6 + State.wind);
        r.alpha *= 0.985;
        ctx.strokeStyle = `rgba(210, 230, 255, ${r.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.35, 0, 0, TAU);
        ctx.stroke();
      }
    }

    function init() {
      canvas = document.getElementById("water");
      ctx = canvas.getContext("2d");
      resize();
      window.addEventListener("resize", resize);

      lakeEl = document.getElementById("lake");
      lakeEl.addEventListener("mousemove", (e) => {
        const r = lakeEl.getBoundingClientRect();
        if (Math.random() < 0.05) {
          spawnRipple(e.clientX - r.left, e.clientY - r.top, 0.5);
        }
      });
      lakeEl.addEventListener("click", (e) => {
        const r = lakeEl.getBoundingClientRect();
        spawnRipple(e.clientX - r.left, e.clientY - r.top, 1.4);
      });
    }

    return { init, draw };
  })();

  /*================================================================
    6. ATMOSPHERE ENGINE — fireflies + clouds + wind-driven mist
  ================================================================*/
  const AtmosphereEngine = (() => {
    let canvas, ctx, w, h;
    let flies = [];
    let clouds = [];
    let mistEl;
    let lanternsTriggered = false;

    function resize() {
      canvas.width = w = window.innerWidth * devicePixelRatio;
      canvas.height = h = window.innerHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      w = window.innerWidth;
      h = window.innerHeight;
    }

    function buildFireflies() {
      flies = [];
      for (let i = 0; i < CONFIG.fireflyCount; i++) {
        flies.push({
          x: rand(0, w),
          y: rand(h * 0.72, h * 0.97),
          vx: rand(-0.3, 0.3),
          vy: rand(-0.2, 0.2),
          phase: rand(0, TAU),
          heartAngle: (i / CONFIG.fireflyCount) * TAU + rand(-0.06, 0.06),
        });
      }
    }

    // Parametric heart curve — classic "16sin^3" shape, flipped so it
    // points up on screen. Each firefly is permanently assigned one
    // point on this curve (heartAngle) so the formation is stable
    // rather than reshuffling every cycle.
    function heartPoint(t, cx, cy, scale) {
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y =
        13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      return { x: cx + x * scale, y: cy - y * scale };
    }

    function smoothstep(t) {
      t = clamp(t, 0, 1);
      return t * t * (3 - 2 * t);
    }

    // Ease the formation in, hold it, then dissolve it — as a
    // fraction of one fireflyHeartCycleMs cycle.
    function heartFactor(cyclePos) {
      const start = 0.55, rampIn = 0.68, rampOut = 0.82, end = 0.92;
      if (cyclePos < start || cyclePos > end) return 0;
      if (cyclePos < rampIn) return smoothstep((cyclePos - start) / (rampIn - start));
      if (cyclePos < rampOut) return 1;
      return 1 - smoothstep((cyclePos - rampOut) / (end - rampOut));
    }

    function buildClouds() {
      const world = document.getElementById("world");
      for (let i = 0; i < 3; i++) {
        const el = document.createElement("div");
        el.className = "cloud";
        el.style.top = `${rand(2, 20)}%`;
        world.appendChild(el);
        clouds.push({
          el,
          x: rand(-400, window.innerWidth),
          speed: rand(4, 9), // seconds-scaled, very slow
          scale: rand(0.8, 1.6),
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      const tsec = State.elapsed / 1000;

      // periodically the fireflies drift together into a heart, hold
      // for a moment, then dissolve back into free wandering
      let heartT = 0;
      if (State.began) {
        const cyclePos =
          ((State.now - State.beganAt) % CONFIG.fireflyHeartCycleMs) /
          CONFIG.fireflyHeartCycleMs;
        heartT = heartFactor(cyclePos);
      }
      const heartCx = w * 0.5;
      const heartCy = h * 0.46;
      const heartScale = Math.min(w, h) * 0.018;

      if (heartT > 0.92 && !lanternsTriggered) {
        lanternsTriggered = true;
        LanternEngine.release(heartCx, heartCy);
      }

      // fireflies — confined to lower third, near the lake
      for (const f of flies) {
        f.vx += rand(-0.02, 0.02);
        f.vy += rand(-0.015, 0.015);
        f.vx = clamp(f.vx, -0.5, 0.5);
        f.vy = clamp(f.vy, -0.35, 0.35);
        f.x += f.vx * (0.5 + State.wind);
        f.y += f.vy * (0.5 + State.wind * 0.5);
        f.x = (f.x + w) % w;
        if (heartT < 0.05) {
          f.y = clamp(f.y, h * 0.68, h * 0.98);
        }

        if (heartT > 0.01) {
          const hp = heartPoint(f.heartAngle, heartCx, heartCy, heartScale);
          f.x = lerp(f.x, hp.x, 0.05 + heartT * 0.06);
          f.y = lerp(f.y, hp.y, 0.05 + heartT * 0.06);
        }

        const glow =
          0.35 + Math.sin(tsec * 1.6 + f.phase) * 0.35 + State.pulse * 0.05 + heartT * 0.25;
        if (glow < 0.15) continue;
        ctx.globalAlpha = clamp(glow, 0, 1);
        ctx.fillStyle = heartT > 0.3 ? "#FFC7D6" : "#FFD89C";
        ctx.shadowColor = heartT > 0.3 ? "#FFC7D6" : "#FFD89C";
        ctx.shadowBlur = 18 + heartT * 22;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 2.8 + heartT * 1.4, 0, TAU);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      // clouds — DOM elements, slow drift, occasional moon crossing
      for (const c of clouds) {
        c.x += (0.15 + State.wind * 0.4) * (State.dt / 16.6) * (c.speed / 6);
        if (c.x > window.innerWidth + 400) c.x = -400;
        c.el.style.transform = `translate(${c.x}px, 0) scale(${c.scale})`;

        const overMoon =
          Math.abs(c.x + 170 - State.moonPos.x) < 220 &&
          parseFloat(c.el.style.top) < 25;
        c.el.style.opacity = overMoon ? "0.5" : String(rand(0.1, 0.22));

        const moonEl = document.getElementById("moon");
        if (moonEl) {
          moonEl.style.filter = overMoon
            ? "brightness(0.72) blur(0.4px)"
            : moonEl.dataset.eclipse || "brightness(1)";
        }
      }

      // wind -> mist speed, via CSS custom property free approach:
      // just retarget the animation-duration directly.
      if (mistEl) {
        const dur = lerp(70, 28, State.wind);
        mistEl.style.animationDuration = `${dur}s`;
        mistEl.style.opacity = String(0.3 + State.wind * 0.35);
      }
    }

    function init() {
      canvas = document.createElement("canvas");
      canvas.id = "fireflies-canvas";
      document.getElementById("world").appendChild(canvas);
      ctx = canvas.getContext("2d");
      mistEl = document.getElementById("mist");
      resize();
      buildFireflies();
      buildClouds();
      window.addEventListener("resize", () => {
        resize();
        buildFireflies();
      });
    }

    return { init, draw };
  })();

  /*================================================================
    6a. LANTERN ENGINE — photos carried up as lanterns, the big reveal
  ================================================================*/
  const LanternEngine = (() => {
    let lanterns = [];
    let panel;
    let released = false;

    function buildLanterns() {
      const world = document.getElementById("world");
      lanterns = CONFIG.photos.map((p) => {
        const el = document.createElement("div");
        el.className = "lantern";
        const glow = document.createElement("div");
        glow.className = "lantern-glow";
        const photo = document.createElement("div");
        photo.className = "lantern-photo";
        photo.style.backgroundImage = `url("${p.src}")`;
        el.appendChild(glow);
        el.appendChild(photo);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          showPhoto(p);
        });
        world.appendChild(el);
        return {
          el,
          x: 0,
          y: 0,
          startX: 0,
          startY: 0,
          targetX: 0,
          targetY: 0,
          releaseAt: 0,
          phase: rand(0, TAU),
        };
      });
    }

    function showPhoto(p) {
      panel.innerHTML = "";
      const img = document.createElement("img");
      img.src = p.src;
      img.alt = "";
      const cap = document.createElement("p");
      cap.textContent = p.caption;
      const hint = document.createElement("span");
      hint.className = "close-hint";
      hint.textContent = "click anywhere to close";
      panel.appendChild(img);
      panel.appendChild(cap);
      panel.appendChild(hint);
      panel.classList.add("visible");
    }

    function hidePhoto() {
      panel.classList.remove("visible");
    }

    // Called once, right when the firefly heart fully forms — scatters
    // resting spots across the upper sky (avoiding the moon's corner)
    // and staggers each lantern's launch for a cascading rise.
    function release(originX, originY) {
      if (released) return;
      released = true;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const n = lanterns.length;
      const cols = Math.ceil(n / 2);

      lanterns.forEach((l, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        l.startX = originX;
        l.startY = originY;
        l.x = originX;
        l.y = originY;
        l.targetX = w * (0.1 + (col / Math.max(1, cols - 1)) * 0.5) + rand(-16, 16);
        l.targetY = h * (0.14 + row * 0.14) + rand(-12, 12);
        l.releaseAt = State.now + i * 260;
        l.el.classList.add("visible");
      });
    }

    function tick() {
      if (!released) return;
      for (const l of lanterns) {
        const t = clamp((State.now - l.releaseAt) / CONFIG.lanternRiseDurationMs, 0, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out
        l.x = lerp(l.startX, l.targetX, eased);
        l.y = lerp(l.startY, l.targetY, eased);
        const bob = t >= 1 ? Math.sin(State.elapsed / 1000 * 0.6 + l.phase) * 5 : 0;
        l.el.style.transform = `translate(${l.x - 37}px, ${l.y - 37 + bob}px)`;
      }
    }

    function init() {
      buildLanterns();
      panel = document.createElement("div");
      panel.className = "memory-panel";
      document.getElementById("world").appendChild(panel);
      document.getElementById("world").addEventListener("click", () => {
        if (panel.classList.contains("visible")) hidePhoto();
      });
    }

    return { init, tick, release };
  })();

  /*================================================================
    6b. PETAL ENGINE — soft falling blossom petals
  ================================================================*/
  const PetalEngine = (() => {
    let canvas, ctx, w, h;
    let petals = [];

    const COLORS = ["#FFD9C0", "#FFC9D6", "#F7B7A3", "#FFE3C7"];

    function resize() {
      canvas.width = w = window.innerWidth * devicePixelRatio;
      canvas.height = h = window.innerHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      w = window.innerWidth;
      h = window.innerHeight;
    }

    function spawnPetal(fromTop) {
      return {
        x: rand(0, w),
        y: fromTop ? rand(-h * 0.3, 0) : rand(0, h),
        size: rand(5, 10),
        vy: rand(0.28, 0.6),
        swaySpeed: rand(0.3, 0.7),
        swayPhase: rand(0, TAU),
        rot: rand(0, TAU),
        rotSpeed: rand(-0.01, 0.01),
        color: COLORS[randInt(0, COLORS.length - 1)],
        alpha: rand(0.35, 0.75),
      };
    }

    function build() {
      petals = [];
      for (let i = 0; i < CONFIG.petalCount; i++) petals.push(spawnPetal(false));
    }

    function drawPetal(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.quadraticCurveTo(p.size * 0.9, -p.size * 0.2, 0, p.size);
      ctx.quadraticCurveTo(-p.size * 0.9, -p.size * 0.2, 0, -p.size);
      ctx.fill();
      ctx.restore();
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      if (!State.began) return;
      const tsec = State.elapsed / 1000;
      for (const p of petals) {
        p.y += p.vy * (0.5 + State.wind * 0.8);
        p.x += Math.sin(tsec * p.swaySpeed + p.swayPhase) * 0.35 * (0.4 + State.wind);
        p.rot += p.rotSpeed * (0.5 + State.wind);
        if (p.y > h + 20) Object.assign(p, spawnPetal(true));
        drawPetal(p);
      }
      ctx.globalAlpha = 1;
    }

    function init() {
      canvas = document.createElement("canvas");
      canvas.id = "petals-canvas";
      document.getElementById("world").appendChild(canvas);
      ctx = canvas.getContext("2d");
      resize();
      build();
      window.addEventListener("resize", resize);
    }

    return { init, draw };
  })();

  /*================================================================
    6c. STARDUST ENGINE — a trail of gold sparkle dust follows the cursor
  ================================================================*/
  const StardustEngine = (() => {
    let canvas, ctx, w, h;
    let particles = [];
    let lastSpawn = { x: -9999, y: -9999 };

    function resize() {
      canvas.width = w = window.innerWidth * devicePixelRatio;
      canvas.height = h = window.innerHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      w = window.innerWidth;
      h = window.innerHeight;
    }

    function spawn(x, y) {
      const n = randInt(1, 2);
      for (let i = 0; i < n; i++) {
        particles.push({
          x: x + rand(-4, 4),
          y: y + rand(-4, 4),
          vx: rand(-0.25, 0.25),
          vy: rand(-0.6, -0.15),
          size: rand(0.8, 2.2),
          life: 1,
          decay: rand(0.012, 0.022),
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      if (!State.began) return;

      const mx = State.mouse.x;
      const my = State.mouse.y;
      const moved = dist(mx, my, lastSpawn.x, lastSpawn.y) > 6;
      if (moved && mx > -100 && my > -100) {
        spawn(mx, my);
        lastSpawn = { x: mx, y: my };
      }

      particles = particles.filter((p) => p.life > 0);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        ctx.globalAlpha = clamp(p.life, 0, 1) * 0.9;
        ctx.fillStyle = p.life > 0.5 ? "#FFF3D9" : "#FFD89C";
        ctx.shadowColor = "#FFD89C";
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    function init() {
      canvas = document.createElement("canvas");
      canvas.id = "stardust-canvas";
      document.getElementById("world").appendChild(canvas);
      ctx = canvas.getContext("2d");
      resize();
      window.addEventListener("resize", resize);
    }

    return { init, draw };
  })();

  /*================================================================
    7. WORLD ENGINE — parallax, audio sync, eclipse, begin sequence
  ================================================================*/
  const WorldEngine = (() => {
    let layers = [];
    let eclipseStarted = 0;
    let audioCtx, analyser, freqData, audioEl;

    function setupParallax() {
      // Parallax is applied via margin offsets so it never fights
      // with elements that already have a CSS transform animation
      // (the moon's moonFloat keyframes, for example).
      layers = [
        { el: document.getElementById("stars"), depth: 2, useTransform: true },
        { el: document.getElementById("moon"), depth: 5 },
        { el: document.getElementById("mountains"), depth: 9 },
        { el: document.getElementById("left-tree"), depth: 16 },
        { el: document.getElementById("right-tree"), depth: -16 },
      ].filter((l) => l.el);

      window.addEventListener("mousemove", (e) => {
        State.mouse.tx = e.clientX;
        State.mouse.ty = e.clientY;
      });
    }

    function applyParallax() {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const nx = (State.mouse.x - cx) / cx || 0;
      const ny = (State.mouse.y - cy) / cy || 0;

      for (const l of layers) {
        const ox = nx * l.depth;
        const oy = ny * l.depth * 0.4;
        if (l.useTransform) {
          l.el.style.transform = `translate(${ox}px, ${oy}px)`;
        } else {
          l.el.style.marginLeft = `${ox}px`;
          l.el.style.marginTop = `${oy}px`;
        }
      }
    }

    function setupEclipse() {
      // A slow, barely-there colour drift on the moon partway through
      // the session — subtle enough that most people won't consciously
      // clock it happening.
      eclipseStarted = State.t0 + rand(6, 10) * 60 * 1000;
    }

    function applyEclipse() {
      const moonEl = document.getElementById("moon");
      if (!moonEl) return;
      const since = State.now - eclipseStarted;
      const duration = 3 * 60 * 1000;
      if (since < 0 || since > duration) {
        moonEl.dataset.eclipse = "";
        return;
      }
      const t = since / duration; // 0..1
      const wave = Math.sin(t * Math.PI); // in and back out
      const hue = wave * 22; // small hue drift toward amber/red
      const dim = 1 - wave * 0.18;
      moonEl.dataset.eclipse = `hue-rotate(${hue}deg) brightness(${dim})`;
      if (!AtmosphereEngine.cloudsOverMoon) {
        moonEl.style.filter = moonEl.dataset.eclipse;
      }
    }

    function setupAudio() {
      if (!CONFIG.musicSrc) return;
      audioEl = document.getElementById("bgMusic");
      if (!audioEl) return;
      audioEl.src = CONFIG.musicSrc;
    }

    function startAudio() {
      if (!audioEl) return;
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.createMediaElementSource(audioEl);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        freqData = new Uint8Array(analyser.frequencyBinCount);
        src.connect(analyser);
        analyser.connect(audioCtx.destination);
        audioEl.volume = 0.6;
        audioEl.play().catch(() => {});
      } catch (err) {
        /* audio sync is optional — fail silently */
      }
    }

    function sampleAudio() {
      if (!analyser) return;
      analyser.getByteFrequencyData(freqData);
      let sum = 0;
      for (let i = 0; i < freqData.length; i++) sum += freqData[i];
      const avg = sum / freqData.length / 255;
      State.audioLevel = lerp(State.audioLevel, avg, 0.15);
      // fold gently into the shared pulse so stars/moon/mist breathe
      // slightly with the music, never overwhelming the base rhythm
      State.pulse = clamp(State.pulse + (State.audioLevel - 0.3) * 0.3, -1.3, 1.3);
    }

    function setupBegin() {
      const btn = document.getElementById("begin");
      const intro = document.getElementById("intro");
      if (!btn) return;
      btn.addEventListener("click", () => {
        if (State.began) return;
        State.began = true;
        State.beganAt = State.now;
        if (intro) {
          intro.style.transition = "opacity 1.6s ease";
          intro.style.opacity = "0";
          setTimeout(() => {
            intro.style.pointerEvents = "none";
          }, 1600);
        }
        startAudio();
        MoonPortalEngine.ready();
      });
    }

    function init() {
      setupParallax();
      setupEclipse();
      setupAudio();
      setupBegin();
    }

    function tick() {
      applyParallax();
      applyEclipse();
      sampleAudio();
    }

    return { init, tick };
  })();

  /*================================================================
    7b. JOURNEY ENGINE — scroll further into the night (act two)
  ================================================================*/
  const JourneyEngine = (() => {
    let world, scene, hint, panel;
    let progress = 0; // smoothed 0..1, how far into act two we are
    let targetProgress = 0;
    let touchStartY = null;

    function buildHint() {
      hint = document.createElement("div");
      hint.id = "scroll-hint";
      hint.innerHTML = `<span>scroll to keep going</span><div class="chevron"></div>`;
      document.getElementById("world").appendChild(hint);
    }

    // A point along the same quadratic curve drawn in #lantern-string,
    // so each hanging photo sits exactly on the line.
    function curveY(t, p0, p1, p2) {
      return (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
    }

    function buildScene() {
      scene = document.createElement("section");
      scene.id = "act-two";
      scene.innerHTML = `
        <div id="act-two-sky"></div>
        <div id="dock"></div>
        <div id="boat"></div>
        <svg id="lantern-string" viewBox="0 0 1000 200" preserveAspectRatio="none">
          <path d="M0,40 Q500,160 1000,40" stroke="rgba(255,216,156,.35)" stroke-width="2" fill="none"/>
        </svg>
        <div id="act-two-text">
          <h2></h2>
          <p></p>
        </div>
      `;
      scene.querySelector("h2").textContent = CONFIG.act2Title;
      scene.querySelector("p").textContent = CONFIG.act2Subtitle;
      document.body.appendChild(scene);

      const stringEl = scene.querySelector("#lantern-string");
      const n = CONFIG.dockPhotos.length;
      CONFIG.dockPhotos.forEach((p, i) => {
        const t = (i + 1) / (n + 1);
        const x = t * 1000;
        const y = curveY(t, 40, 160, 40);
        const lantern = document.createElement("div");
        lantern.className = "dock-lantern";
        lantern.style.left = `${(x / 1000) * 100}%`;
        lantern.style.top = `${(y / 200) * 100}%`;
        lantern.innerHTML = `<div class="lantern-glow"></div><div class="lantern-photo" style="background-image:url('${p.src}')"></div>`;
        lantern.addEventListener("click", (e) => {
          e.stopPropagation();
          showPhoto(p);
        });
        stringEl.after(lantern);
      });

      panel = document.createElement("div");
      panel.className = "memory-panel";
      scene.appendChild(panel);
      scene.addEventListener("click", () => {
        if (panel.classList.contains("visible")) panel.classList.remove("visible");
      });
    }

    function showPhoto(p) {
      panel.innerHTML = "";
      const img = document.createElement("img");
      img.src = p.src;
      img.alt = "";
      const cap = document.createElement("p");
      cap.textContent = p.caption;
      const closeHint = document.createElement("span");
      closeHint.className = "close-hint";
      closeHint.textContent = "click anywhere to close";
      panel.append(img, cap, closeHint);
      panel.classList.add("visible");
    }

    function onWheel(e) {
      if (!State.began) return;
      targetProgress = clamp(targetProgress + e.deltaY * CONFIG.scrollSensitivity, 0, 1);
      e.preventDefault();
    }

    function onTouchStart(e) {
      touchStartY = e.touches[0].clientY;
    }

    function onTouchMove(e) {
      if (!State.began || touchStartY === null) return;
      const dy = touchStartY - e.touches[0].clientY;
      targetProgress = clamp(targetProgress + dy * CONFIG.scrollSensitivity * 2.2, 0, 1);
      touchStartY = e.touches[0].clientY;
      e.preventDefault();
    }

    function tick() {
      progress = lerp(progress, targetProgress, 0.07);

      world.style.transform = `translateY(${-progress * 12}%) scale(${1 - progress * 0.05})`;
      world.style.filter = `blur(${progress * 5}px) brightness(${1 - progress * 0.25})`;
      world.style.pointerEvents = progress < 0.4 ? "auto" : "none";

      scene.style.transform = `translateY(${(1 - progress) * 60}px)`;
      scene.style.opacity = clamp((progress - 0.1) / 0.7, 0, 1);
      scene.style.pointerEvents = progress > 0.55 ? "auto" : "none";

      hint.style.opacity = State.began ? clamp(1 - progress * 6, 0, 1) * 0.75 : 0;
    }

    function init() {
      world = document.getElementById("world");
      buildHint();
      buildScene();
      window.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("touchstart", onTouchStart, { passive: true });
      window.addEventListener("touchmove", onTouchMove, { passive: false });
    }

    return { init, tick };
  })();

  /*================================================================
    7c. CELESTIAL BLOOM ENGINE — click the moon, crack the sky open
    into a second sky: an explosion of stars, a storm of meteors,
    then a slow gravity-like gathering into one giant constellation
    shaped like a heart. Pure visual. No words.
  ================================================================*/
  const MoonPortalEngine = (() => {
    const B = CONFIG.celestialBloom;

    let overlay, streaksEl, canvas, ctx, w, h;
    let opened = false, closing = false;
    let raf = null;
    let bloomStart = 0;
    let originX = 0, originY = 0;

    let field = [];    // dense ambient starfield, fixed positions, just twinkles
    let particles = []; // everything that flies out of the burst
    let shapeIdx = [];  // indices into `particles` that form the heart outline, in order
    let meteors = [];
    let nextMeteorAt = 0;
    let flashLife = 0;
    let rings = [];

    // -- the payoff: photos orbiting the settled heart, then (on
    // click) the heart splitting open in a burst of tiny hearts
    // and confetti -- 
    let orbitEls = [];      // DOM elements, one per CONFIG.photos entry
    let orbitSpawned = false;
    let hintEl = null;
    let finalePanel = null;
    let finaleTriggered = false;
    let finaleStart = 0;
    let confetti = [];      // tiny hearts + ribbons from the split burst

    // -- timing (ms from bloomStart) --
    const T_BURST_END = 1500;
    const T_CONVERGE_START = 2600;
    const T_CONVERGE_END = 7600;
    const T_ORBIT_SPAWN = T_CONVERGE_END + 900; // photos rise shortly after the heart settles
    const FINALE_SPLIT_MS = 2200;  // how long the two halves take to pull apart
    const FINALE_CONFETTI_MS = 4800; // how long confetti keeps falling

    const PALETTE_AMBIENT = ["#FFFFFF", "#DCE8FF", "#FFE9C7"];
    const PALETTE_WARM = ["#FFD89C", "#FFE9C7", "#FFC1D9", "#FFB3C6"];
    const PALETTE_COOL = ["#C9AFFF", "#AFE0FF", "#DCE8FF"];

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function heartPoint(t, cx, cy, scale) {
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(
        13 * Math.cos(t) -
        5 * Math.cos(2 * t) -
        2 * Math.cos(3 * t) -
        Math.cos(4 * t)
      );
      return { x: cx + x * scale, y: cy + y * scale };
    }

    function buildField() {
      field = [];
      for (let i = 0; i < B.fieldStarCount; i++) {
        field.push({
          x: rand(0, w),
          y: rand(0, h),
          size: rand(0.5, 1.9),
          color: PALETTE_AMBIENT[randInt(0, PALETTE_AMBIENT.length - 1)],
          baseAlpha: rand(0.15, 0.7),
          twPhase: rand(0, TAU),
          twSpeed: rand(0.3, 1.4),
          appearAt: rand(0, 1100),
        });
      }
    }

    // Build the full burst: shape-bound stars (outline of the heart),
    // filler stars (a soft cluster scattered inside it), and pure
    // chaos stars that never converge — they just become part of the
    // permanent sky once the storm settles.
    function buildParticles() {
      particles = [];
      shapeIdx = [];

      const cx = w * B.shapeCenter.x;
      const cy = h * B.shapeCenter.y;
      const scale = (B.shapeSize * Math.min(w, h)) / 32;

      const n = B.shapePointCount;
      for (let i = 0; i < n; i++) {
        const t = (i / n) * TAU;
        const target = heartPoint(t, cx, cy, scale);
        shapeIdx.push(particles.length);
        particles.push(makeParticle(target, PALETTE_WARM, true));
      }

      for (let i = 0; i < B.fillerStarCount; i++) {
        const t = rand(0, TAU);
        const r = Math.sqrt(rand(0.02, 0.72)); // bias outward a touch for even fill
        const p = heartPoint(t, cx, cy, scale);
        const target = {
          x: cx + (p.x - cx) * r,
          y: cy + (p.y - cy) * r,
        };
        particles.push(makeParticle(target, PALETTE_WARM, false));
      }

      const chaosCount = Math.max(0, B.burstCount - n - B.fillerStarCount);
      for (let i = 0; i < chaosCount; i++) {
        particles.push(makeParticle(null, PALETTE_COOL, false));
      }
    }

    function makeParticle(target, palette, isShapePoint) {
      const angle = rand(0, TAU);
      const speed = rand(2.2, 8.5) * (target ? rand(0.6, 1) : rand(0.8, 1.3));
      return {
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: target ? rand(1.6, 2.6) : rand(0.8, 2.2),
        color: palette[randInt(0, palette.length - 1)],
        target,
        isShapePoint,
        converging: false,
        convergeFrom: null,
        arrival: 0, // 0..1 how "locked in" it is
        twPhase: rand(0, TAU),
        twSpeed: rand(0.5, 1.8),
        swirl: rand(-1, 1) * 0.6,
      };
    }

    // -- orbit photos: rise out of the settled heart and take up
    // slow, staggered elliptical orbits around it, like tiny moons. --
    function spawnOrbitPhotos() {
      orbitSpawned = true;
      const photos = CONFIG.photos.filter((p) => p && p.src);
      orbitEls = photos.map((p, i) => {
        const el = document.createElement("div");
        el.className = "orbit-photo";
        el.innerHTML = `<div class="orbit-photo-glow"></div><div class="orbit-photo-img" style="background-image:url('${p.src}')"></div>`;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          showFinalePhoto(p);
        });
        overlay.appendChild(el);
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("visible")));
        return {
          el,
          angle: (i / photos.length) * TAU + rand(-0.2, 0.2),
          speed: rand(0.09, 0.14) * (i % 2 === 0 ? 1 : -1), // alternate direction, feels less mechanical
          rxFactor: rand(1.55, 1.85),
          ryFactor: rand(0.62, 0.8),
          bob: rand(0, TAU),
        };
      });
      if (hintEl) hintEl.classList.add("visible");
    }

    function tickOrbitPhotos(tsec) {
      if (!orbitEls.length) return;
      const cx = w * B.shapeCenter.x;
      const cy = h * B.shapeCenter.y;
      const scale = (B.shapeSize * Math.min(w, h)) / 32;
      for (const o of orbitEls) {
        const a = o.angle + tsec * o.speed;
        const rx = scale * 16 * o.rxFactor;
        const ry = scale * 13 * o.ryFactor;
        const x = cx + Math.cos(a) * rx;
        const y = cy + Math.sin(a) * ry + Math.sin(tsec * 0.6 + o.bob) * 6;
        o.el.style.left = `${x}px`;
        o.el.style.top = `${y}px`;
      }
    }

    function buildFinalePanel() {
      finalePanel = document.createElement("div");
      finalePanel.className = "memory-panel";
      overlay.appendChild(finalePanel);
    }

    function showFinalePhoto(p) {
      if (!finalePanel) return;
      finalePanel.innerHTML = "";
      const img = document.createElement("img");
      img.src = p.src;
      img.alt = "";
      const cap = document.createElement("p");
      cap.textContent = p.caption || "";
      const closeHint = document.createElement("span");
      closeHint.className = "close-hint";
      closeHint.textContent = "click anywhere to close";
      finalePanel.append(img, cap, closeHint);
      finalePanel.classList.add("visible");
    }

    function buildStreaks(n = 60) {
      streaksEl.innerHTML = "";
      const frag = document.createDocumentFragment();
      const colors = [
        "rgba(255,216,156,VAR)",
        "rgba(255,193,217,VAR)",
        "rgba(200,225,255,VAR)",
        "rgba(230,235,255,VAR)",
      ];
      for (let i = 0; i < n; i++) {
        const s = document.createElement("div");
        s.className = "moon-portal-streak";
        const c = colors[randInt(0, colors.length - 1)];
        s.style.background = `linear-gradient(to bottom, transparent, ${c.replace("VAR", ".9")}, transparent)`;
        s.style.left = rand(0, 100) + "%";
        s.style.height = rand(70, 220) + "px";
        s.style.animationDuration = rand(1.1, 2.9) + "s";
        s.style.animationDelay = rand(0, 2.6) + "s";
        frag.appendChild(s);
      }
      streaksEl.appendChild(frag);
    }

    function resize() {
      const rect = overlay.getBoundingClientRect();
      canvas.width = w = rect.width * devicePixelRatio;
      canvas.height = h = rect.height * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      w = rect.width;
      h = rect.height;
      buildField();
      if (opened) buildParticles();
    }

    function drawGlowDot(x, y, size, color, alpha) {
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, TAU);
      ctx.fill();
    }

    function spawnMeteor() {
      const startX = rand(w * 0.05, w * 0.95);
      const startY = rand(0, h * 0.3);
      const angle = rand(0.5, 1.05);
      const speed = rand(9, 17);
      const palette = [...PALETTE_WARM, ...PALETTE_COOL];
      meteors.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: rand(80, 220),
        life: 1,
        color: palette[randInt(0, palette.length - 1)],
      });
    }

    // -- the finale: the heart splits down its seam and a burst of
    // tiny hearts + confetti ribbons pour out of it -- 
    function triggerFinale() {
      if (finaleTriggered || !orbitSpawned) return;
      finaleTriggered = true;
      finaleStart = performance.now();

      const cx = w * B.shapeCenter.x;
      const cy = h * B.shapeCenter.y;
      const confettiColors = ["#FFD89C", "#FFB3C6", "#FFC1D9", "#EEF4F9", "#C9AFFF", "#FFF6E6"];
      confetti = [];
      const n = 170;
      for (let i = 0; i < n; i++) {
        const angle = rand(0, TAU);
        const speed = rand(2.5, 11);
        const isHeart = Math.random() < 0.45;
        confetti.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - rand(1, 4), // extra upward kick
          size: isHeart ? rand(5, 11) : rand(4, 9),
          shape: isHeart ? "heart" : Math.random() < 0.5 ? "rect" : "circle",
          color: confettiColors[randInt(0, confettiColors.length - 1)],
          rot: rand(0, TAU),
          rotSpeed: rand(-0.12, 0.12),
          life: 1,
          drag: rand(0.975, 0.99),
        });
      }

      // orbit photos scatter outward with the confetti rather than
      // just vanishing — feels like part of the same burst
      for (const o of orbitEls) o.el.classList.add("hidden-finale");
      if (hintEl) hintEl.classList.remove("visible");
    }

    function drawTinyHeart(x, y, size, rot, color, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.fillStyle = color;
      ctx.beginPath();
      const s = size / 16;
      for (let i = 0; i <= 24; i++) {
        const t = (i / 24) * TAU;
        const p = heartPoint(t, 0, 0, s);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawConfettiPiece(c) {
      ctx.globalAlpha = clamp(c.life, 0, 1);
      if (c.shape === "heart") {
        drawTinyHeart(c.x, c.y, c.size, c.rot, c.color, c.life);
      } else if (c.shape === "rect") {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
        ctx.restore();
      } else {
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.size / 2.4, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function tickConfetti() {
      const gravity = 0.11;
      for (const c of confetti) {
        c.vx *= c.drag;
        c.vy = c.vy * c.drag + gravity;
        c.x += c.vx;
        c.y += c.vy;
        c.rot += c.rotSpeed;
        if (c.y > h * 0.7) c.life -= 0.012; // fade once it drifts low
        drawConfettiPiece(c);
      }
      confetti = confetti.filter((c) => c.life > 0 && c.y < h + 40);
    }

    function step(now) {
      if (!opened && !closing) return;
      const elapsed = now - bloomStart;
      const phaseFade = closing ? 0.5 : elapsed < T_BURST_END ? 0.16 : elapsed < T_CONVERGE_END ? 0.14 : 0.4;

      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.fillStyle = `rgba(3,6,13,${phaseFade})`;
      ctx.fillRect(0, 0, w, h);

      const tsec = elapsed / 1000;

      // -- ambient field --
      for (const s of field) {
        const ef = elapsed < s.appearAt ? 0 : clamp((elapsed - s.appearAt) / 500, 0, 1);
        if (ef <= 0) continue;
        const flicker = Math.sin(tsec * s.twSpeed + s.twPhase) * 0.35;
        drawGlowDot(s.x, s.y, s.size, s.color, s.baseAlpha * (0.75 + flicker) * ef);
      }

      // -- initial flash --
      if (flashLife > 0) {
        const grad = ctx.createRadialGradient(originX, originY, 0, originX, originY, Math.max(w, h) * 0.55);
        grad.addColorStop(0, `rgba(255,246,230,${flashLife * 0.9})`);
        grad.addColorStop(0.35, `rgba(255,216,156,${flashLife * 0.35})`);
        grad.addColorStop(1, "rgba(255,216,156,0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        flashLife = Math.max(0, flashLife - 0.045);
      }

      // -- shockwave rings --
      for (const r of rings) {
        r.radius += r.speed;
        r.alpha *= 0.965;
        if (r.alpha < 0.01) continue;
        ctx.globalAlpha = r.alpha;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.width;
        ctx.beginPath();
        ctx.arc(originX, originY, r.radius, 0, TAU);
        ctx.stroke();
      }
      rings = rings.filter((r) => r.alpha >= 0.01);
      ctx.globalAlpha = 1;

      // -- particles --
      const convergeT = clamp((elapsed - T_CONVERGE_START) / (T_CONVERGE_END - T_CONVERGE_START), 0, 1);
      const eased = easeInOutCubic(convergeT);
      const breathe = elapsed > T_CONVERGE_END ? 1 + Math.sin(tsec * 0.55) * 0.012 : 1;
      const cx = w * B.shapeCenter.x;
      const cy = h * B.shapeCenter.y;

      for (const p of particles) {
        if (p.target && elapsed >= T_CONVERGE_START) {
          if (!p.converging) {
            p.converging = true;
            p.convergeFrom = { x: p.x, y: p.y };
          }
          const bx = cx + (p.target.x - cx) * breathe;
          const by = cy + (p.target.y - cy) * breathe;
          p.x = lerp(p.convergeFrom.x, bx, eased);
          p.y = lerp(p.convergeFrom.y, by, eased);
          p.arrival = eased;
        } else {
          // free flight: outward burst with light drag + gentle swirl
          p.vx *= 0.983;
          p.vy *= 0.983;
          p.vx += Math.sin(tsec * 0.6 + p.twPhase) * p.swirl * 0.02;
          p.vy += Math.cos(tsec * 0.5 + p.twPhase) * p.swirl * 0.02;
          p.x += p.vx;
          p.y += p.vy;
        }

        const flicker = Math.sin(tsec * p.twSpeed + p.twPhase) * 0.3;
        const alpha = p.target
          ? clamp(0.55 + p.arrival * 0.45 + flicker * 0.2, 0, 1)
          : clamp(0.55 + flicker, 0.15, 1);
        drawGlowDot(p.x, p.y, p.size * (p.target ? 1 + p.arrival * 0.3 : 1), p.color, alpha);

        if (p.arrival > 0.9) {
          ctx.globalAlpha = (p.arrival - 0.9) * 4;
          ctx.fillStyle = "rgba(255,255,255,.9)";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2.4, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // -- the heart's outline, drawn as it locks into place. Once the
      // finale starts, it stops closing the loop (so the two halves
      // read as pulling apart, not a seam being stretched) and fades. --
      if (shapeIdx.length > 1 && elapsed >= T_CONVERGE_START) {
        const finaleFade = finaleTriggered
          ? clamp(1 - (now - finaleStart) / (FINALE_SPLIT_MS * 0.9), 0, 1)
          : 1;
        const glow = clamp(eased, 0, 1) * finaleFade;
        if (glow > 0.01) {
          const cx = w * B.shapeCenter.x;
          ctx.strokeStyle = `rgba(255, 216, 200, ${0.15 + glow * 0.55})`;
          ctx.lineWidth = 1;
          ctx.shadowColor = "rgba(255, 190, 210, .85)";
          ctx.shadowBlur = 5 + glow * 7;
          ctx.beginPath();
          let penDown = false;
          for (let i = 0; i <= shapeIdx.length; i++) {
            const p = particles[shapeIdx[i % shapeIdx.length]];
            const prev = particles[shapeIdx[(i - 1 + shapeIdx.length) % shapeIdx.length]];
            // break the stroke wherever the outline would have to
            // cross the split gap between the two halves
            if (finaleTriggered && Math.sign(p.target.x - cx) !== Math.sign(prev.target.x - cx)) {
              penDown = false;
            }
            if (!penDown) { ctx.moveTo(p.x, p.y); penDown = true; }
            else ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      // -- occasional meteors, denser during the storm, rare at rest --
      const meteorGapMin = elapsed < T_CONVERGE_START ? 260 : 5000;
      const meteorGapMax = elapsed < T_CONVERGE_START ? 900 : 11000;
      if (now > nextMeteorAt) {
        spawnMeteor();
        nextMeteorAt = now + rand(meteorGapMin, meteorGapMax);
      }
      meteors = meteors.filter((m) => m.life > 0);
      for (const m of meteors) {
        m.x += m.vx;
        m.y += m.vy;
        m.life -= 0.015;
        const segLen = Math.hypot(m.vx, m.vy) || 1;
        const tailX = m.x - (m.vx / segLen) * m.len;
        const tailY = m.y - (m.vy / segLen) * m.len;
        const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
        grad.addColorStop(0, m.color);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalAlpha = clamp(m.life, 0, 1);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (m.x > w + 60 || m.y > h + 60) m.life = 0;
      }

      // -- the payoff: once the heart has held its shape for a beat,
      // your photos rise up and settle into orbit around it -- 
      if (!orbitSpawned && elapsed >= T_ORBIT_SPAWN) spawnOrbitPhotos();
      if (orbitSpawned && !finaleTriggered) tickOrbitPhotos(tsec);

      // -- the finale: the heart pulls apart at the seam and a burst
      // of tiny hearts + confetti pours out of it -- 
      if (finaleTriggered) {
        const fElapsed = now - finaleStart;
        const splitT = easeInOutCubic(clamp(fElapsed / FINALE_SPLIT_MS, 0, 1));
        const cx = w * B.shapeCenter.x;
        for (let i = 0; i < shapeIdx.length; i++) {
          const p = particles[shapeIdx[i]];
          const side = p.target.x < cx ? -1 : 1;
          const drift = splitT * (0.5 + Math.abs(p.target.x - cx) / w) * Math.min(w, h) * 0.28;
          p.x = p.target.x + side * drift;
          p.y = p.target.y + splitT * Math.min(w, h) * 0.1;
        }
        for (const p of particles) {
          if (!p.target || p.isShapePoint) continue;
          const side = p.target.x < cx ? -1 : 1;
          const drift = splitT * 0.5 * (0.4 + Math.abs(p.target.x - cx) / w) * Math.min(w, h) * 0.28;
          p.x = p.target.x + side * drift;
          p.y = p.target.y + splitT * Math.min(w, h) * 0.1;
        }
        tickConfetti();
      }

      if (closing) {
        closing = false; // one more frame then the RAF stops naturally on transitionend timeout
      }

      raf = requestAnimationFrame(step);
    }

    function open(ox, oy) {
      if (opened) return;
      opened = true;
      closing = false;
      originX = ox;
      originY = oy;
      overlay.style.setProperty("--portal-x", `${ox}px`);
      overlay.style.setProperty("--portal-y", `${oy}px`);
      buildStreaks();
      resize();
      buildParticles();
      meteors = [];
      rings = [
        { radius: 4, speed: 9, alpha: 0.9, width: 2.4, color: "rgba(255,246,230,.9)" },
        { radius: 4, speed: 6.4, alpha: 0.7, width: 1.6, color: "rgba(255,193,217,.8)" },
        { radius: 4, speed: 4.2, alpha: 0.55, width: 1.2, color: "rgba(180,210,255,.7)" },
      ];
      flashLife = 1;
      bloomStart = performance.now();
      nextMeteorAt = bloomStart + 200;

      // fresh start for the payoff sequence each time the portal opens
      for (const o of orbitEls) o.el.remove();
      orbitEls = [];
      orbitSpawned = false;
      finaleTriggered = false;
      confetti = [];
      if (hintEl) hintEl.classList.remove("visible");
      if (finalePanel) finalePanel.classList.remove("visible");

      overlay.classList.add("open");
      if (!raf) raf = requestAnimationFrame(step);
    }

    function close() {
      if (!opened) return;
      opened = false;
      closing = true;
      overlay.classList.remove("open");
      if (hintEl) hintEl.classList.remove("visible");
      if (finalePanel) finalePanel.classList.remove("visible");
      setTimeout(() => {
        if (raf) cancelAnimationFrame(raf);
        raf = null;
        closing = false;
        if (ctx) ctx.clearRect(0, 0, w, h);
        for (const o of orbitEls) o.el.remove();
        orbitEls = [];
      }, 1700);
    }

    // The overlay's click behaves in three stages: while the heart is
    // still forming, a click backs out early; once the photos are in
    // orbit, the first click sets off the finale (split + confetti);
    // and a click after that closes the portal.
    function onOverlayClick() {
      if (!opened) return;
      if (finalePanel && finalePanel.classList.contains("visible")) {
        finalePanel.classList.remove("visible");
        return;
      }
      if (orbitSpawned && !finaleTriggered) {
        triggerFinale();
        return;
      }
      close();
    }

    function build() {
      overlay = document.createElement("div");
      overlay.className = "moon-portal";
      overlay.innerHTML = `
        <div class="moon-portal-nebula">
          <div class="nebula-blob"></div>
          <div class="nebula-blob"></div>
          <div class="nebula-blob"></div>
          <div class="nebula-blob"></div>
        </div>
        <div class="moon-portal-stars"></div>
        <canvas class="moon-portal-canvas"></canvas>
        <div class="moon-portal-vignette"></div>
        <div class="portal-hint">touch the heart</div>
      `;
      document.body.appendChild(overlay);
      streaksEl = overlay.querySelector(".moon-portal-stars");
      canvas = overlay.querySelector(".moon-portal-canvas");
      hintEl = overlay.querySelector(".portal-hint");
      ctx = canvas.getContext("2d");
      buildFinalePanel();
      overlay.addEventListener("click", onOverlayClick);
      window.addEventListener("resize", () => {
        if (opened) resize();
      });
    }

    function init() {
      build();
      const moon = document.getElementById("moon");
      if (!moon) return;
      moon.addEventListener("click", (e) => {
        if (!State.began) return;
        e.stopPropagation();
        const rect = moon.getBoundingClientRect();
        open(rect.left + rect.width / 2, rect.top + rect.height / 2);
      });
    }

    // Called once the visitor has clicked "Begin" — this is the only
    // signal that tells her the moon is interactive at all, which is
    // exactly why it feels like a secret she found rather than a
    // button she was told about.
    function ready() {
      const moon = document.getElementById("moon");
      if (moon) moon.classList.add("portal-ready");
    }

    return { init, ready };
  })();

  /*================================================================
    8. MAIN LOOP
  ================================================================*/
  function ensureOverlays() {
    const world = document.getElementById("world");
    if (!document.querySelector(".aurora-overlay")) {
      const div = document.createElement("div");
      div.className = "aurora-overlay";
      world.appendChild(div);
    }
    if (!document.querySelector(".vignette-overlay")) {
      const div = document.createElement("div");
      div.className = "vignette-overlay";
      world.appendChild(div);
    }
  }

  // The sky wakes up gradually: hero/bright stars first, then the
  // moon fades in, then dimmer stars keep arriving, and the intro
  // text rises in last — so the very first seconds feel like an
  // arrival rather than a page just finishing loading.
  function runEntranceSequence() {
    const moon = document.getElementById("moon");
    const intro = document.getElementById("intro");
    const vignette = document.querySelector(".vignette-overlay");
    requestAnimationFrame(() => {
      if (vignette) vignette.classList.add("revealed");
      if (moon) setTimeout(() => moon.classList.add("revealed"), 350);
      if (intro)
        setTimeout(
          () => intro.classList.add("revealed"),
          CONFIG.entranceDurationMs * 0.55
        );
    });
  }

  // Warm, irregular flicker for the moon's box-shadow glow — layered
  // sines plus a touch of randomness so it reads as candlelight
  // rather than a mechanical pulse.
  function applyCandleFlicker() {
    const moonEl = document.getElementById("moon");
    if (!moonEl) return;
    const t = State.elapsed / 1000;
    const flicker =
      1 +
      Math.sin(t * 1.7) * 0.05 +
      Math.sin(t * 4.3 + 1.1) * 0.035 +
      Math.sin(t * 9.1 + 2.7) * 0.02 +
      (Math.random() - 0.5) * 0.015;
    moonEl.style.setProperty("--candle", flicker.toFixed(3));
  }

  function applyBreathingZoom() {
    const world = document.getElementById("world");
    if (!world) return;
    const phase = (State.elapsed / CONFIG.zoomPeriodMs) * TAU;
    const zoom = 1 + CONFIG.zoomAmplitude + Math.sin(phase) * CONFIG.zoomAmplitude;
    world.style.transform = `scale(${zoom.toFixed(5)})`;
  }

  function frame(now) {
    updateSharedState(now);
    SkyEngine.draw();
    ConstellationEngine.draw();
    WaterEngine.draw();
    AtmosphereEngine.draw();
    LanternEngine.tick();
    PetalEngine.draw();
    StardustEngine.draw();
    WorldEngine.tick();
    JourneyEngine.tick();
    applyBreathingZoom();
    applyCandleFlicker();
    requestAnimationFrame(frame);
  }

  function init() {
    injectStyles();
    ensureOverlays();
    SkyEngine.init();
    ConstellationEngine.init();
    WaterEngine.init();
    AtmosphereEngine.init();
    LanternEngine.init();
    PetalEngine.init();
    StardustEngine.init();
    WorldEngine.init();
    JourneyEngine.init();
    MoonPortalEngine.init();
    runEntranceSequence();
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
