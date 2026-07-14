/**
 * handTracking.js
 * Wraps MediaPipe Hands to track one hand and expose
 * the index finger tip (landmark #8) in screen-space coordinates.
 */

export class HandTracker {
  /**
   * @param {HTMLVideoElement} videoEl
   * @param {object} options
   * @param {number} [options.maxHands=1]
   * @param {number} [options.minDetectionConfidence=0.75]
   * @param {number} [options.minTrackingConfidence=0.75]
   */
  constructor(videoEl, options = {}) {
    this.video   = videoEl;
    this.options = {
      maxHands:               1,
      minDetectionConfidence: 0.75,
      minTrackingConfidence:  0.75,
      ...options,
    };

    /** Normalised landmark #8 {x, y} in [0,1] range. */
    this.indexTipNorm = null;

    /** Screen-space pixel position {x, y} after mapping to canvas size. */
    this.indexTipScreen = null;

    /** True when a hand is currently visible. */
    this.handDetected = false;

    this._hands = null;
    this._mpCamera = null;

    // User callbacks
    this.onResults  = null; // (landmarks) => void
    this.onHandLost = null; // () => void
  }

  /**
   * Initialise MediaPipe Hands and start the Camera utility
   * so that frames flow into MediaPipe automatically.
   * @returns {Promise<void>}
   */
  async init() {
    this._hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this._hands.setOptions({
      maxNumHands:             this.options.maxHands,
      modelComplexity:         1,
      minDetectionConfidence:  this.options.minDetectionConfidence,
      minTrackingConfidence:   this.options.minTrackingConfidence,
    });

    this._hands.onResults((results) => this._handleResults(results));

    // MediaPipe's Camera utility pumps frames into Hands automatically.
    this._mpCamera = new Camera(this.video, {
      onFrame: async () => {
        await this._hands.send({ image: this.video });
      },
      width:  this.video.videoWidth  || 640,
      height: this.video.videoHeight || 480,
    });

    await this._mpCamera.start();
  }

  /**
   * Internal: called every frame by MediaPipe with detection results.
   * @param {object} results — MediaPipe Hands results object
   */
  _handleResults(results) {
    if (
      results.multiHandLandmarks &&
      results.multiHandLandmarks.length > 0
    ) {
      const landmarks = results.multiHandLandmarks[0]; // first hand only
      const tip = landmarks[8]; // Index Finger Tip

      this.handDetected    = true;
      this.indexTipNorm    = { x: tip.x, y: tip.y };

      if (typeof this.onResults === 'function') {
        this.onResults(landmarks);
      }
    } else {
      if (this.handDetected && typeof this.onHandLost === 'function') {
        this.onHandLost();
      }
      this.handDetected    = false;
      this.indexTipNorm    = null;
      this.indexTipScreen  = null;
    }
  }

  /**
   * Map normalised landmark coordinates to canvas pixel coordinates.
   * Accounts for horizontal mirror flip (canvas is CSS-mirrored).
   * @param {number} canvasW — canvas display width in pixels
   * @param {number} canvasH — canvas display height in pixels
   */
  updateScreenCoords(canvasW, canvasH) {
    if (!this.indexTipNorm) {
      this.indexTipScreen = null;
      return;
    }

    // MediaPipe gives x in [0,1] from left of un-mirrored image.
    // The canvas is CSS-mirrored (scaleX(-1)), so we do NOT flip x here —
    // the flip is handled visually. For collision detection (which works
    // in the un-mirrored DOM space) we DO flip x.
    const xFlipped = 1 - this.indexTipNorm.x; // mirror for DOM space
    this.indexTipScreen = {
      x: xFlipped * canvasW,
      y: this.indexTipNorm.y * canvasH,
    };
  }

  /** Stop the MediaPipe camera pump. */
  async stop() {
    if (this._mpCamera) {
      await this._mpCamera.stop();
    }
  }
}
