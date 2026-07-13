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
    musicSrc: "", // e.g. "song.mp3" — leave "" to skip audio sync

    starCounts: { tiny: 1300, medium: 250, bright: 40, hero: 8 },
    milkyWayStars: 900,
    dustCount: 140,

    rotationPeriodMs: 12 * 60 * 1000, // 12 minutes for a full sweep
    meteorMinGapMs: 18000,
    meteorMaxGapMs: 55000,

    fireflyCount: 22,

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
        });
      }
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

      // fireflies — confined to lower third, near the lake
      for (const f of flies) {
        f.vx += rand(-0.02, 0.02);
        f.vy += rand(-0.015, 0.015);
        f.vx = clamp(f.vx, -0.5, 0.5);
        f.vy = clamp(f.vy, -0.35, 0.35);
        f.x += f.vx * (0.5 + State.wind);
        f.y += f.vy * (0.5 + State.wind * 0.5);
        f.x = (f.x + w) % w;
        f.y = clamp(f.y, h * 0.68, h * 0.98);

        const glow = 0.35 + Math.sin(tsec * 1.6 + f.phase) * 0.35 + State.pulse * 0.05;
        if (glow < 0.15) continue;
        ctx.globalAlpha = clamp(glow, 0, 1);
        ctx.fillStyle = "#FFD89C";
        ctx.shadowColor = "#FFD89C";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 1.6, 0, TAU);
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
      audioEl = document.getElementById("bg-music");
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
        if (intro) {
          intro.style.transition = "opacity 1.6s ease";
          intro.style.opacity = "0";
          setTimeout(() => {
            intro.style.pointerEvents = "none";
          }, 1600);
        }
        startAudio();
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
    WorldEngine.tick();
    applyBreathingZoom();
    requestAnimationFrame(frame);
  }

  function init() {
    injectStyles();
    ensureOverlays();
    SkyEngine.init();
    ConstellationEngine.init();
    WaterEngine.init();
    AtmosphereEngine.init();
    WorldEngine.init();
    runEntranceSequence();
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
