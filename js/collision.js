/**
 * collision.js
 * Checks whether the index finger tip is inside the wick collision circle.
 * Supports toggle: touching the wick again extinguishes the candle.
 */

export class CollisionDetector {
  /**
   * @param {import('./candle.js').Candle}             candle
   * @param {import('./handTracking.js').HandTracker}   tracker
   * @param {import('./animation.js').AnimationEngine}  engine
   */
  constructor(candle, tracker, engine) {
    this.candle  = candle;
    this.tracker = tracker;
    this.engine  = engine;

    /** Callback: () => void — fired when candle is lit */
    this.onIgnite     = null;

    /** Callback: () => void — fired when candle is extinguished */
    this.onExtinguish = null;

    /**
     * True when finger is inside wick zone (for visual feedback).
     * Stays true while finger is held inside.
     */
    this.isNearWick = false;

    /**
     * Edge-trigger guard: we fire toggle only on the leading edge
     * (finger enters zone), not continuously while held inside.
     */
    this._wasInsideZone = false;
  }

  /**
   * Run one collision check per animation frame.
   * @param {number} canvasW
   * @param {number} canvasH
   * @returns {boolean} true if a toggle was triggered this frame
   */
  check(canvasW, canvasH) {
    const tip = this.tracker.indexTipScreen;
    if (!tip) {
      this.isNearWick     = false;
      this._wasInsideZone = false;
      return false;
    }

    const wick = this.engine.getWickScreenPos(canvasW, canvasH);
    if (!wick) {
      this.isNearWick     = false;
      this._wasInsideZone = false;
      return false;
    }

    const dist   = euclideanDistance(tip, wick);
    const radius = this.candle.collisionRadius;

    // Update proximity indicator (wider zone for visual warning)
    this.isNearWick = dist < radius * 2.2;

    const isInside = dist < radius;

    // ── Edge trigger: only fire on finger ENTERING the zone ──
    if (isInside && !this._wasInsideZone) {
      this._wasInsideZone = true;

      // Toggle candle state
      const result = this.candle.toggle();

      if (result === 'lit' && typeof this.onIgnite === 'function') {
        this.onIgnite();
        return true;
      }
      if (result === 'extinguished' && typeof this.onExtinguish === 'function') {
        this.onExtinguish();
        return true;
      }
    }

    // Reset edge trigger when finger exits the zone
    if (!isInside) {
      this._wasInsideZone = false;
    }

    return false;
  }
}

/**
 * Euclidean distance between two 2D points.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 */
export function euclideanDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
