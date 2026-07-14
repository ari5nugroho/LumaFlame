/**
 * candle.js
 * Manages candle on/off state.
 * Supports toggle: light() and extinguish().
 */

export class Candle {
  constructor() {
    /** Is the candle currently lit? */
    this.isLit = false;

    /**
     * Collision radius in canvas pixels (tuned to candle display size).
     * Updated externally based on rendered candle width.
     */
    this.collisionRadius = 32;

    /**
     * Cooldown after toggle to prevent instant re-trigger.
     * Timestamp (ms) of last state change.
     */
    this._lastToggleTime = 0;
    this._cooldownMs     = 1500; // 1.5 seconds between toggles
  }

  /** Light the candle. Returns true if state changed. */
  light() {
    if (this.isLit) return false;
    if (Date.now() - this._lastToggleTime < this._cooldownMs) return false;

    this.isLit = true;
    this._lastToggleTime = Date.now();
    document.body.classList.add('candle-lit');
    return true;
  }

  /** Extinguish the candle. Returns true if state changed. */
  extinguish() {
    if (!this.isLit) return false;
    if (Date.now() - this._lastToggleTime < this._cooldownMs) return false;

    this.isLit = false;
    this._lastToggleTime = Date.now();
    document.body.classList.remove('candle-lit');
    return true;
  }

  /**
   * Toggle on/off based on current state.
   * @returns {'lit' | 'extinguished' | 'cooldown'}
   */
  toggle() {
    if (Date.now() - this._lastToggleTime < this._cooldownMs) {
      return 'cooldown';
    }
    if (this.isLit) {
      this.extinguish();
      return 'extinguished';
    } else {
      this.light();
      return 'lit';
    }
  }
}
