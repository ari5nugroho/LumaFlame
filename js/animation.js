/**
 * animation.js
 * Handles ALL rendering on the main canvas:
 *   1. Live webcam feed (mirrored via JS)
 *   2. Dark vignette + warm atmosphere
 *   3. Candle image (multiply blend — white bg removed)
 *   4. Procedural flame (small, accurate to wick tip)
 *   5. Rising smoke particles
 *   6. Floating warm ambient particles + sparks
 *   7. Finger-tracking glow dot
 */

/* ─── Smooth noise helper ────────────────────────────── */
function smoothNoise(t) {
  return Math.sin(t * 1.7) * 0.5 +
         Math.sin(t * 3.1) * 0.3 +
         Math.sin(t * 5.3) * 0.2;
}

/* ─── Ambient Particle ───────────────────────────────── */
class Particle {
  constructor(x, y, type = 'glow') {
    this.type = type;
    this.reset(x, y);
  }
  reset(x, y) {
    this.x      = x + (Math.random() - 0.5) * 30;
    this.y      = y;
    this.vx     = (Math.random() - 0.5) * 0.7;
    this.vy     = -(Math.random() * 1.2 + 0.3);
    this.life   = 1.0;
    this.decay  = Math.random() * 0.006 + 0.003;
    this.radius = Math.random() * 2.0 + 0.6;
    this.hue    = 28 + Math.random() * 28;
  }
  update() {
    this.x    += this.vx;
    this.y    += this.vy;
    this.vx   += (Math.random() - 0.5) * 0.04;
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

    /** Candle state */
    this.isLit          = false;
    this.igniteTime     = null;   // rAF timestamp of ignition
    this.extinguishTime = null;   // rAF timestamp of extinguish

    /** Finger tracking */
    this.fingerPos  = null;       // { x, y } in canvas pixels
    this.isNearWick = false;

    /** Cached candle render rect — updated every frame */
    this._candleRect = null;

    /** Particle lists */
    this._particles = [];
    this._smokeList = [];

    this._rafId = null;
    this._t     = 0; // seconds since page load
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

  /** Fire when candle is lit. */
  ignite() {
    this.isLit          = true;
    this.igniteTime     = this._t;
    this.extinguishTime = null;
  }

  /**
   * Fire when candle is blown out.
   * After fade duration, resets isLit so it can be re-lit.
   */
  extinguish() {
    this.extinguishTime = this._t;
    this.isLit          = false; // collision logic also resets candle.isLit externally

    // Clear sparks immediately
    this._particles = this._particles.filter(p => p.type !== 'spark');
  }

  resize(w, h) {
    this.mainCanvas.width  = w;
    this.mainCanvas.height = h;
  }

  /** Return wick canvas position (for collision detector). */
  getWickScreenPos(W, H) {
    return this._getWickPos(W, H);
  }

  /* ─────────── Main Frame ─────────── */
  _frame() {
    const ctx = this.ctx;
    const W   = this.mainCanvas.width;
    const H   = this.mainCanvas.height;
    const t   = this._t;

    // 1 — Mirrored webcam feed
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.video, 0, 0, W, H);
    ctx.restore();

    // 2 — Vignette
    this._drawVignette(ctx, W, H);

    // 3 — Candle image (multiply = white disappears)
    this._drawCandle(ctx, W, H, t);

    // 4 — Floor glow when lit
    if (this.isLit || this.extinguishTime !== null) {
      const litOpacity = this.isLit ? 1.0 : Math.max(0, 1 - (t - this.extinguishTime) / 0.8);
      if (litOpacity > 0) this._drawFloorGlow(ctx, W, H, t, litOpacity);
    }

    // 5 — Particles
    this._updateParticles(ctx, W, H, t);

    // 6 — Flame & smoke
    const showFlame = this.isLit || (this.extinguishTime !== null && t - this.extinguishTime < 0.55);
    const showSmoke = this.isLit || (this.extinguishTime !== null && t - this.extinguishTime < 2.5);

    if (showFlame) this._drawFlame(ctx, W, H, t);
    if (showSmoke) this._drawSmoke(ctx, W, H, t);

    // 7 — Finger dot
    this._drawFingerDot(ctx, W, t);
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

    // Responsive width: ~22% of viewport, clamped
    const cw = Math.max(120, Math.min(260, W * 0.22));
    const ch = this.candleImg.naturalHeight * (cw / this.candleImg.naturalWidth);
    const cx = (W - cw) / 2;
    const cy = H - ch;

    // Cache for wick position
    this._candleRect = { x: cx, y: cy, w: cw, h: ch };

    // Multiply blend: white pixels × dark background = dark (disappear)
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.candleImg, cx, cy, cw, ch);
    ctx.restore();

    // Warm lit glow on candle body when lit
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

  /* ─────────── Floor Glow ─────────── */
  _drawFloorGlow(ctx, W, H, t, opacity = 1) {
    const pulse = 0.7 + 0.15 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 5.7);
    const g = ctx.createRadialGradient(W/2, H, 0, W/2, H, W * 0.5);
    g.addColorStop(0,    `rgba(255, 155, 35, ${0.15 * pulse * opacity})`);
    g.addColorStop(0.45, `rgba(190, 90,  10, ${0.06 * pulse * opacity})`);
    g.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ─────────── Particles ─────────── */
  _updateParticles(ctx, W, H, t) {
    // Ambient dust
    if (Math.random() < 0.10) {
      this._particles.push(new Particle(
        Math.random() * W,
        Math.random() * H * 0.8 + H * 0.1,
        'glow'
      ));
    }

    // Sparks near flame when lit
    if (this.isLit && Math.random() < 0.30) {
      const wick = this._getWickPos(W, H);
      if (wick) this._particles.push(new Particle(wick.x, wick.y - 10, 'spark'));
    }

    this._particles = this._particles.filter(p => {
      p.update();
      if (p.isDead) return false;

      const alpha = p.type === 'spark' ? p.life * 0.85 : p.life * 0.20;
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

    // ── Ignition animation (0 → 0.7 s) ──
    const elapsed       = this.igniteTime !== null ? t - this.igniteTime : 999;
    const igniteScale   = elapsed < 0.7 ? 0.35 + 0.65 * (elapsed / 0.7) : 1.0;
    const igniteOpacity = elapsed < 0.4 ? elapsed / 0.4 : 1.0;

    // ── Extinguish fade-out (0 → 0.5 s) ──
    let extOpacity = 1.0;
    if (this.extinguishTime !== null) {
      const ext = t - this.extinguishTime;
      extOpacity = Math.max(0, 1 - ext / 0.5);
    }

    const opacity = igniteOpacity * extOpacity;
    if (opacity <= 0.01) return;

    // ── Organic flicker ──
    const fx  = smoothNoise(t * 3.7) * 2.5;
    const fy  = smoothNoise(t * 2.9) * 1.5;
    const fs  = 1 + smoothNoise(t * 5.1) * 0.04;
    const fsx = 1 + smoothNoise(t * 4.3) * 0.03;

    ctx.save();
    ctx.translate(wick.x + fx, wick.y + fy);
    ctx.scale(igniteScale * fs * fsx, igniteScale * fs);
    ctx.globalAlpha = opacity;

    // ── Layer 1: Outer orange halo ──
    this._flameShape(ctx, 0, 0, 16, 7,
      [[0,'rgba(255,85,0,0)'],[0.35,'rgba(255,85,0,0.18)'],
       [0.7,'rgba(255,60,0,0.08)'],[1,'rgba(255,40,0,0)']],
      -36
    );

    // ── Layer 2: Amber mid ──
    this._flameShape(ctx, 0, -2, 10, 4,
      [[0,'rgba(255,180,20,0)'],[0.2,'rgba(255,165,15,0.82)'],
       [0.6,'rgba(255,100,0,0.55)'],[1,'rgba(220,60,0,0)']],
      -40
    );

    // ── Layer 3: Yellow core ──
    this._flameShape(ctx, 0, -9, 5.5, 2.5,
      [[0,'rgba(255,255,200,0.95)'],[0.3,'rgba(255,230,80,0.88)'],
       [0.7,'rgba(255,160,0,0.4)'],[1,'rgba(255,80,0,0)']],
      -46
    );

    // ── Layer 4: White-hot tip ──
    this._flameShape(ctx, 0, -18, 2.5, 1.5,
      [[0,'rgba(255,255,255,0.98)'],[0.4,'rgba(255,255,220,0.72)'],
       [1,'rgba(255,210,60,0)']],
      -52
    );

    ctx.restore();

    // ── Soft glow at wick base ──
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

  /**
   * Draw one teardrop-shaped flame layer.
   * Origin = base of flame (wick tip). tipY < 0 (points upward).
   */
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

    // Spawn above flame tip; more smoke when extinguishing
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

    // Outer glow halo
    ctx.globalAlpha = 0.82;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
    g.addColorStop(0,   this.isNearWick ? 'rgba(255,110,0,0.6)'  : 'rgba(255,220,80,0.5)');
    g.addColorStop(0.5, this.isNearWick ? 'rgba(255,90,0,0.22)'  : 'rgba(255,200,60,0.18)');
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Core dot
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

  /**
   * Wick tip position in canvas coords.
   * candle.png: wick is at ~50% horizontally, ~7% from top of image.
   */
  _getWickPos(W, H) {
    const r = this._candleRect;
    if (!r) return null;
    return {
      x: r.x + r.w * 0.50,
      y: r.y + r.h * 0.07,   // 7% from top = very tip of the candle
    };
  }
}
