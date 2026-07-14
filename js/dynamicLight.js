/**
 * dynamicLight.js
 * Implements a premium, volumetric Dynamic Light system.
 * Simulates indirect candle illumination casting warm light on the webcam scene.
 */

export class DynamicLight {
  constructor() {
    this.intensity        = 0.0;
    this.currentIntensity = 0.0;
    this.radius           = 220;
    this.opacity          = 0.15;
    this.expansionProgress = 0.0;
    this.flameScaleModifier = 0.0;

    // Offset for breathing sines to ensure organic phase
    this.timeOffset = Math.random() * 100;
  }

  /**
   * Update dynamic light state parameters.
   * @param {boolean} isLit
   * @param {number} proximityGlow
   * @param {number} t
   * @param {number|null} ignitionTime
   */
  updateLight(isLit, proximityGlow, t, ignitionTime) {
    // Determine target intensity based on candle state
    let targetIntensity = 0.0;
    if (isLit) {
      targetIntensity = 1.0;
    } else if (proximityGlow > 0.01) {
      targetIntensity = proximityGlow;
    }

    // Smooth transition
    this.currentIntensity += (targetIntensity - this.currentIntensity) * 0.12;

    // Expansion progress during ignition (500ms)
    if (isLit && ignitionTime !== null) {
      const elapsed = t - ignitionTime;
      this.expansionProgress = Math.min(1.0, elapsed / 0.5);
    } else {
      this.expansionProgress = 0.0;
    }

    // Apply breathing animation
    this.animateLight(t);
  }

  /**
   * Breathe naturally using smooth overlapping sine waves.
   * @param {number} t
   */
  animateLight(t) {
    const elapsed = t + this.timeOffset;

    // Clean sine-based breathing sways
    const radiusBreath = Math.sin(elapsed * 2.2) * 8 + Math.cos(elapsed * 4.1) * 4;
    const opacityBreath = Math.sin(elapsed * 1.6) * 0.012 + Math.cos(elapsed * 3.4) * 0.006;

    // Base radius is 230px, fluctuating between 220px and 240px
    const baseRadius = 230 + radiusBreath;

    // Combine breathing sways with flame scale modifier
    this.radius = baseRadius + this.flameScaleModifier;

    // Base opacity: 0.15, breathing between 0.14 and 0.18
    this.opacity = Math.max(0.10, Math.min(0.20, 0.15 + opacityBreath));
  }

  /**
   * Sync the illumination intensity and radius with the current scale of the flame.
   * @param {number} flameScale
   */
  syncWithFlame(flameScale) {
    // Subtle variation: if flame is larger, increase light radius slightly.
    this.flameScaleModifier = (flameScale - 1.0) * 35;
  }

  /**
   * Render the dynamic light radial gradient centered on the flame.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} wickX
   * @param {number} wickY
   * @param {boolean} isLit
   * @param {number} proximityGlow
   */
  renderLight(ctx, wickX, wickY, isLit, proximityGlow) {
    if (this.currentIntensity < 0.01) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    let renderRadius = 0;
    let renderOpacity = 0;

    if (isLit) {
      // Expand smoothly during 500ms ignition using cubic-out easing
      const ease = 1 - Math.pow(1 - this.expansionProgress, 3);
      renderRadius = 25 + (this.radius - 25) * ease;
      renderOpacity = this.opacity * ease * this.currentIntensity;
    } else {
      // Proximity glow: very small warm glow around the wick only
      renderRadius = 15 + 30 * proximityGlow;
      renderOpacity = 0.16 * proximityGlow * this.currentIntensity;
    }

    if (renderRadius < 5) {
      ctx.restore();
      return;
    }

    // Volumetric radial gradient matching warm candle color specifications:
    // Center: #FFD36B, Middle: rgba(255,190,90,0.25), Outer: rgba(255,150,40,0)
    const g = ctx.createRadialGradient(wickX, wickY, 0, wickX, wickY, renderRadius);
    g.addColorStop(0,   `rgba(255, 211, 107, ${renderOpacity})`);
    g.addColorStop(0.5, `rgba(255, 190, 90,  ${renderOpacity * 0.25})`);
    g.addColorStop(1,   'rgba(255, 150, 40, 0)');

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(wickX, wickY, renderRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
