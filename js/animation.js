/**
 * animation.js
 * Handles ALL rendering and interaction state updates on the main canvas:
 *   1. Live webcam feed (mirrored via JS)
 *   2. Dark vignette + warm atmosphere
 *   3. Candle image (multiply blend — white bg removed)
 *   4. Proximity Ignition logic (outer 80px radius, inner 20px radius, 400ms timer)
 *   5. Particle simulation (tiny gold pre-ignite sparks, warm rising embers post-ignite)
 *   6. Procedural flame (flickering, rotation, soft scale/brightness variations)
 *   7. Finger-tracking glow dot
 */

import { DynamicLight } from './dynamicLight.js';

/* ─── Smooth Noise Helper ────────────────────────────── */
function smoothNoise(t) {
  return Math.sin(t * 1.7) * 0.5 +
         Math.sin(t * 3.1) * 0.3 +
         Math.sin(t * 5.3) * 0.2;
}

/* ─── Easing Helper (Smooth Step / Interpolation) ────── */
function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end;
}

/* ─── Ambient / Gold / Spark Particle ────────────────── */
class Particle {
  constructor(x, y, type = 'glow') {
    this.type = type;
    this.reset(x, y);
  }

  reset(x, y) {
    if (this.type === 'gold') {
      // Tiny gold sparks floating near wick before ignition
      this.x      = x + (Math.random() - 0.5) * 16;
      this.y      = y + (Math.random() - 0.5) * 16;
      this.vx     = (Math.random() - 0.5) * 0.4;
      this.vy     = -(Math.random() * 0.4 + 0.1);
      this.life   = 1.0;
      this.decay  = Math.random() * 0.012 + 0.006;
      this.radius = Math.random() * 1.3 + 0.4;
      this.hue    = 42 + Math.random() * 10; // warm gold
    } else if (this.type === 'spark') {
      // Ignition spark burst
      this.x      = x;
      this.y      = y;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2.2 + 0.6;
      this.vx     = Math.cos(angle) * speed;
      this.vy     = Math.sin(angle) * speed - 0.5;
      this.life   = 1.0;
      this.decay  = Math.random() * 0.03 + 0.015;
      this.radius = Math.random() * 2.0 + 0.8;
      this.hue    = 35 + Math.random() * 15; // orange-gold
    } else {
      // Standard ambient glow dust
      this.x      = x + (Math.random() - 0.5) * 30;
      this.y      = y;
      this.vx     = (Math.random() - 0.5) * 0.6;
      this.vy     = -(Math.random() * 1.0 + 0.2);
      this.life   = 1.0;
      this.decay  = Math.random() * 0.005 + 0.002;
      this.radius = Math.random() * 1.8 + 0.5;
      this.hue    = 28 + Math.random() * 28; // warm oranges
    }
  }

  update() {
    this.x    += this.vx;
    this.y    += this.vy;
    this.vx   += (Math.random() - 0.5) * 0.03;
    this.life -= this.decay;
  }

  get isDead() { return this.life <= 0; }
}

/* ─── Smoke Particle ─────────────────────────────────── */
class SmokeParticle {
  constructor(x, y) { this.reset(x, y); }
  reset(x, y) {
    this.x      = x + (Math.random() - 0.5) * 5;
    this.y      = y;
    this.vx     = (Math.random() - 0.5) * 0.3;
    this.vy     = -(Math.random() * 0.5 + 0.15);
    this.life   = 1.0;
    this.decay  = Math.random() * 0.005 + 0.002;
    this.radius = Math.random() * 5 + 2;
  }
  update() {
    this.x    += this.vx;
    this.y    += this.vy;
    this.vx   += (Math.random() - 0.5) * 0.04;
    this.vy   *= 0.99;
    this.life -= this.decay;
    this.radius += 0.08;
  }
  get isDead() { return this.life <= 0; }
}

/* ─── AnimationEngine ────────────────────────────────── */
export class AnimationEngine {
  /**
   * @param {HTMLCanvasElement} mainCanvas
   * @param {HTMLVideoElement}  videoEl
   * @param {HTMLImageElement}  candleImg
   */
  constructor(mainCanvas, videoEl, candleImg) {
    this.mainCanvas = mainCanvas;
    this.ctx        = mainCanvas.getContext('2d');
    this.video      = videoEl;
    this.candleImg  = candleImg;

    /** Volumetric Dynamic Light System */
    this.dynamicLight = new DynamicLight();

    /** Candle state */
    this.isLit          = false;
    this.igniteTime     = null;
    this.extinguishTime = null;
    this.lastToggleTime = 0;

    /** Finger tracking coords & state */
    this.fingerPos  = null;       // { x, y } in canvas pixels
    this.isNearWick = false;

    /** Proximity Ignition Logic */
    this.proximity      = 0.0;     // current target proximity (0.0 to 1.0)
    this.proximityGlow  = 0.0;     // smoothed proximity with easing
    this.ignitionTimer  = null;    // timestamp when finger entered inner radius
    this.interactionState = 'Waiting...'; // Waiting..., Finger Detected, Ready to Ignite, Igniting..., Candle Lit

    /** Callbacks for state synchronization */
    this.onIgnite     = null;
    this.onExtinguish = null;

    /** Cached candle rect */
    this._candleRect = null;

    /** Active particles */
    this._particles = [];
    this._smokeList = [];

    this._rafId = null;
    this._t     = 0;
  }

  /* ─────────── Public API ─────────── */

  start() {
    const loop = (ts) => {
      this._t   = ts / 1000;
      this._frame();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  ignite() {
    this.isLit            = true;
    this.igniteTime       = this._t;
    this.extinguishTime   = null;
    this.lastToggleTime   = this._t;
    this.interactionState = 'Candle Lit';

    // Trigger instant spark burst
    const wick = this._getWickPos(this.mainCanvas.width, this.mainCanvas.height);
    if (wick) {
      for (let i = 0; i < 20; i++) {
        this._particles.push(new Particle(wick.x, wick.y, 'spark'));
      }
    }
  }

  extinguish() {
    this.isLit          = false;
    this.extinguishTime = this._t;
    this.lastToggleTime = this._t;

    // Clear ignition variables
    this.ignitionTimer  = null;
    this.proximity      = 0.0;
    this.proximityGlow  = 0.0;

    // Clear active sparks
    this._particles = this._particles.filter(p => p.type !== 'spark');
  }

  resize(w, h) {
    this.mainCanvas.width  = w;
    this.mainCanvas.height = h;
  }

  getWickScreenPos(W, H) {
    return this._getWickPos(W, H);
  }

  /* ─────────── Proximity & Ignition Logic ─────────── */

  updateProximity(W, H) {
    if (this.isLit) {
      this.proximity      = 0.0;
      this.proximityGlow  = 0.0;
      this.interactionState = 'Candle Lit';
      return;
    }

    const pos = this.fingerPos;
    if (!pos) {
      this.proximity      = 0.0;
      this.proximityGlow  = lerp(this.proximityGlow, 0.0, 0.15);
      this.interactionState = 'Waiting...';
      return;
    }

    const wick = this._getWickPos(W, H);
    if (!wick) {
      this.proximity      = 0.0;
      this.proximityGlow  = lerp(this.proximityGlow, 0.0, 0.15);
      this.interactionState = 'Waiting...';
      return;
    }

    const dx = pos.x - wick.x;
    const dy = pos.y - wick.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    this.isNearWick = dist < 80;

    // Detection zones: Outer (80px) and Inner (20px)
    if (dist >= 80) {
      this.proximity = 0.0;
      this.interactionState = 'Finger Detected';
    } else if (dist <= 20) {
      this.proximity = 1.0;
      this.interactionState = 'Igniting...';
    } else {
      // 20 < dist < 80: Linear gradient scaling
      this.proximity = (80 - dist) / 60;
      this.interactionState = 'Ready to Ignite';
    }

    // Easing transition for the glow brightness and radius
    this.proximityGlow = lerp(this.proximityGlow, this.proximity, 0.15);
  }

  updateIgnition(W, H) {
    const t = this._t;

    // Check extinguish toggle: If candle is lit and finger touches wick
    if (this.isLit) {
      const pos = this.fingerPos;
      if (pos) {
        const wick = this._getWickPos(W, H);
        if (wick) {
          const dx = pos.x - wick.x;
          const dy = pos.y - wick.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // If touching wick (inner 20px) after cooldown (1.5 seconds)
          if (dist <= 20 && t - this.lastToggleTime > 1.5) {
            this.extinguish();
            if (typeof this.onExtinguish === 'function') {
              this.onExtinguish();
            }
          }
        }
      }
      return;
    }

    // Ignition timer check: Must dwell inside 20px for 400ms
    if (this.interactionState === 'Igniting...') {
      if (this.ignitionTimer === null) {
        this.ignitionTimer = t; // start countdown
      } else if (t - this.ignitionTimer >= 0.40) { // 400ms completed
        this.ignite();
        if (typeof this.onIgnite === 'function') {
          this.onIgnite();
        }
        this.ignitionTimer = null;
      }
    } else {
      // Finger left the touch boundary, reset countdown
      this.ignitionTimer = null;
    }
  }

  /* ─────────── Rendering Elements ─────────── */

  _frame() {
    const ctx = this.ctx;
    const W   = this.mainCanvas.width;
    const H   = this.mainCanvas.height;
    const t   = this._t;

    // 1 — Mirrored webcam feed (Camera)
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.video, 0, 0, W, H);
    ctx.restore();

    // 2 — Vignette (Dark Overlay)
    this._drawVignette(ctx, W, H);

    // 3 — Dynamic Light updates & rendering
    const wick = this._getWickPos(W, H) || { x: W / 2, y: H - 150 };
    const fs = 1 + smoothNoise(t * 5.1) * 0.04; // Sync breathing with flame scale fluctuations
    this.dynamicLight.syncWithFlame(fs);
    this.dynamicLight.updateLight(this.isLit, this.proximityGlow, t, this.igniteTime);
    this.dynamicLight.renderLight(ctx, wick.x, wick.y, this.isLit, this.proximityGlow);

    // 4 — Soft shadow directly beneath the candle
    this._drawShadow(ctx, W, H);

    // 5 — Candle image
    this._drawCandle(ctx, W, H, t);

    // 6 — Proximity updates (mapping distance to 0.0 - 1.0)
    this.updateProximity(W, H);

    // 7 — Ignition timer checking
    this.updateIgnition(W, H);

    // 8 — Render proximity glow halo & wick illumination
    this.renderGlow(ctx, W, H, t);

    // 9 — Flame & smoke
    const showFlame = this.isLit || (this.extinguishTime !== null && t - this.extinguishTime < 0.55);
    const showSmoke = this.isLit || (this.extinguishTime !== null && t - this.extinguishTime < 2.5);

    if (showFlame) this._drawFlame(ctx, W, H, t);
    if (showSmoke) this._drawSmoke(ctx, W, H, t);

    // 10 — Particles
    this.updateParticles(ctx, W, H, t);

    // 11 — Finger dot (UI)
    this._drawFingerDot(ctx, W, t);
  }

  /* ─────────── Candle Shadow ─────────── */
  _drawShadow(ctx, W, H) {
    const candleBottomY = H - 35;
    const cw = Math.max(120, Math.min(260, W * 0.22));
    const shadowOpacity = this.isLit ? 0.07 : 0.18;

    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
    ctx.beginPath();
    ctx.ellipse(W / 2, candleBottomY, cw * 0.35, cw * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ─────────── Vignette ─────────── */
  _drawVignette(ctx, W, H) {
    const g = ctx.createRadialGradient(W/2, H/2, H*0.25, W/2, H/2, H*0.88);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.58)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ─────────── Candle Image ─────────── */
  _drawCandle(ctx, W, H, t) {
    if (!this.candleImg || !this.candleImg.complete) return;

    const cw = Math.max(120, Math.min(260, W * 0.22));
    const ch = this.candleImg.naturalHeight * (cw / this.candleImg.naturalWidth);
    const cx = (W - cw) / 2;
    const cy = (H - 35) - ch;

    this._candleRect = { x: cx, y: cy, w: cw, h: ch };

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.candleImg, cx, cy, cw, ch);
    ctx.restore();

    if (this.isLit) {
      const pulse = 0.8 + 0.2 * Math.sin(t * 2.6);
      ctx.save();
      ctx.globalAlpha = 0.35 * pulse;
      ctx.shadowColor = '#ffaa30';
      ctx.shadowBlur  = 35;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(this.candleImg, cx, cy, cw, ch);
      ctx.restore();
    }
  }

  /* ─────────── renderGlow (Proximity Feedback) ─────────── */
  renderGlow(ctx, W, H, t) {
    const wick = this._getWickPos(W, H);
    if (!wick) return;

    if (!this.isLit && this.proximityGlow > 0.01) {
      const val = this.proximityGlow;
      const pulse = 1.0 + 0.06 * Math.sin(t * 11);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // 1 — Soft warm orange halo around wick
      const radius = (35 + 45 * val) * pulse;
      const g = ctx.createRadialGradient(wick.x, wick.y, 0, wick.x, wick.y, radius);
      g.addColorStop(0,   `rgba(255, 145, 40, ${0.45 * val})`);
      g.addColorStop(0.4, `rgba(255, 95,  20, ${0.18 * val})`);
      g.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(wick.x, wick.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // 2 — Wick core brightening (intensity climbs as we approach)
      const coreR = (4 + 6 * val) * pulse;
      const coreG = ctx.createRadialGradient(wick.x, wick.y, 0, wick.x, wick.y, coreR);
      coreG.addColorStop(0,   `rgba(255, 238, 160, ${0.85 * val})`);
      coreG.addColorStop(0.5, `rgba(255, 165, 30,  ${0.45 * val})`);
      coreG.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = coreG;
      ctx.beginPath();
      ctx.arc(wick.x, wick.y, coreR, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  /* ─────────── Particles (Pre- & Post-Ignition) ─────────── */
  updateParticles(ctx, W, H, t) {
    const wick = this._getWickPos(W, H);

    // Spawn tiny golden particles before ignition when finger is approaching
    if (!this.isLit && this.proximityGlow > 0.05 && wick) {
      // Proportional spawn chance
      const spawnChance = 0.08 * this.proximityGlow;
      if (Math.random() < spawnChance) {
        this._particles.push(new Particle(wick.x, wick.y, 'gold'));
      }
    }

    // Spawn post-ignition embers
    if (this.isLit && Math.random() < 0.28 && wick) {
      this._particles.push(new Particle(wick.x, wick.y - 12, 'glow'));
    }

    // Update and draw
    this._particles = this._particles.filter(p => {
      p.update();
      if (p.isDead) return false;

      const alpha = p.type === 'spark' ? p.life * 0.9 : p.life * (p.type === 'gold' ? 0.75 : 0.25);
      ctx.save();
      ctx.globalAlpha = alpha;
      const r = p.radius * 2.8;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0,   `hsla(${p.hue}, 100%, 88%, 1)`);
      g.addColorStop(0.4, `hsla(${p.hue}, 90%,  65%, 0.55)`);
      g.addColorStop(1,   `hsla(${p.hue}, 80%,  50%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return true;
    });

    if (this._particles.length > 90) this._particles.splice(0, 15);
  }

  /* ─────────── Flame ─────────── */
  _drawFlame(ctx, W, H, t) {
    const wick = this._getWickPos(W, H);
    if (!wick) return;

    const elapsed       = this.igniteTime !== null ? t - this.igniteTime : 999;
    const igniteScale   = elapsed < 0.7 ? 0.35 + 0.65 * (elapsed / 0.7) : 1.0;
    const igniteOpacity = elapsed < 0.4 ? elapsed / 0.4 : 1.0;

    let extOpacity = 1.0;
    if (this.extinguishTime !== null) {
      const ext = t - this.extinguishTime;
      extOpacity = Math.max(0, 1 - ext / 0.5);
    }

    const opacity = igniteOpacity * extOpacity;
    if (opacity <= 0.01) return;

    // Organic flicker + continuous movement
    const fx  = smoothNoise(t * 3.7) * 2.5;
    const fy  = smoothNoise(t * 2.9) * 1.5;
    const fs  = 1 + smoothNoise(t * 5.1) * 0.04;
    const fsx = 1 + smoothNoise(t * 4.3) * 0.03;
    const rot = smoothNoise(t * 2.1) * 0.04; // Gentle rotation sway

    ctx.save();
    ctx.translate(wick.x + fx, wick.y + fy);
    ctx.rotate(rot);
    ctx.scale(igniteScale * fs * fsx, igniteScale * fs);
    ctx.globalAlpha = opacity;

    // Layer 1: Outer orange halo
    this._flameShape(ctx, 0, 0, 16, 7,
      [[0,'rgba(255,85,0,0)'],[0.35,'rgba(255,85,0,0.18)'],
       [0.7,'rgba(255,60,0,0.08)'],[1,'rgba(255,40,0,0)']],
      -36
    );

    // Layer 2: Amber mid
    this._flameShape(ctx, 0, -2, 10, 4,
      [[0,'rgba(255,180,20,0)'],[0.2,'rgba(255,165,15,0.82)'],
       [0.6,'rgba(255,100,0,0.55)'],[1,'rgba(220,60,0,0)']],
      -40
    );

    // Layer 3: Yellow core
    this._flameShape(ctx, 0, -9, 5.5, 2.5,
      [[0,'rgba(255,255,200,0.95)'],[0.3,'rgba(255,230,80,0.88)'],
       [0.7,'rgba(255,160,0,0.4)'],[1,'rgba(255,80,0,0)']],
      -46
    );

    // Layer 4: White-hot tip
    this._flameShape(ctx, 0, -18, 2.5, 1.5,
      [[0,'rgba(255,255,255,0.98)'],[0.4,'rgba(255,255,220,0.72)'],
       [1,'rgba(255,210,60,0)']],
      -52
    );

    ctx.restore();

    // Soft glow at wick base
    ctx.save();
    ctx.globalAlpha = opacity;
    const glowP = 0.65 + 0.2 * Math.sin(t * 2.2) + 0.08 * Math.sin(t * 6.3);
    const gr = ctx.createRadialGradient(wick.x, wick.y, 0, wick.x, wick.y, 22);
    gr.addColorStop(0,   `rgba(255, 195, 55, ${0.32 * glowP})`);
    gr.addColorStop(0.55,`rgba(255, 135, 10, ${0.13 * glowP})`);
    gr.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(wick.x, wick.y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _flameShape(ctx, dx, dy, rx, ry, stops, tipY) {
    ctx.save();
    ctx.translate(dx, dy);
    const g = ctx.createLinearGradient(0, 0, 0, tipY);
    stops.forEach(([p, c]) => g.addColorStop(p, c));

    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
    ctx.bezierCurveTo(-rx, tipY * 0.38, rx * 0.45, tipY * 1.05, 0, tipY);
    ctx.bezierCurveTo(-rx * 0.45, tipY * 1.05, rx, tipY * 0.38, rx, 0);
    ctx.closePath();

    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  /* ─────────── Smoke ─────────── */
  _drawSmoke(ctx, W, H, t) {
    const wick = this._getWickPos(W, H);
    if (!wick) return;

    const isExtinguishing = this.extinguishTime !== null && (t - this.extinguishTime) < 2.5;
    const rate = isExtinguishing ? 0.55 : 0.12;

    if (Math.random() < rate) {
      this._smokeList.push(new SmokeParticle(wick.x, wick.y - 48));
    }

    this._smokeList = this._smokeList.filter(p => {
      p.update();
      if (p.isDead) return false;
      ctx.save();
      ctx.globalAlpha = p.life * 0.12;
      ctx.fillStyle   = 'rgba(210, 195, 170, 1)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return true;
    });

    if (this._smokeList.length > 30) this._smokeList.splice(0, 8);
  }

  /* ─────────── Finger Dot ─────────── */
  _drawFingerDot(ctx, W, t) {
    const pos = this.fingerPos;
    if (!pos) return;

    const { x, y } = pos;
    const pulse = 0.85 + 0.15 * Math.sin(t * 8);
    const r     = this.isNearWick ? 13 * pulse : 9;
    const color = this.isNearWick ? '#ff8c00' : '#ffe066';

    ctx.save();

    ctx.globalAlpha = 0.82;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
    g.addColorStop(0,   this.isNearWick ? 'rgba(255,110,0,0.6)'  : 'rgba(255,220,80,0.5)');
    g.addColorStop(0.5, this.isNearWick ? 'rgba(255,90,0,0.22)'  : 'rgba(255,200,60,0.18)');
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.52, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /* ─────────── Helpers ─────────── */

  _getWickPos(W, H) {
    const r = this._candleRect;
    if (!r) return null;
    return {
      x: r.x + r.w * 0.50,
      y: r.y + r.h * 0.07,
    };
  }
}
