/**
 * camera.js
 * Manages webcam access and provides the video stream.
 * The video element is kept off-screen; frames are consumed
 * by MediaPipe via its own Camera utility.
 */

export class CameraManager {
  /**
   * @param {HTMLVideoElement} videoEl — the hidden <video> element
   */
  constructor(videoEl) {
    this.video    = videoEl;
    this.stream   = null;
    this.isReady  = false;
    this.onReady  = null; // callback when camera is live
  }

  /**
   * Request webcam permission and start the video stream.
   * Prefers environment camera on mobile; front on desktop.
   * @returns {Promise<HTMLVideoElement>}
   */
  async start() {
    const constraints = {
      video: {
        width:  { ideal: 1280, min: 640 },
        height: { ideal: 720,  min: 480 },
        facingMode: 'user', // front camera
        frameRate: { ideal: 60, min: 30 },
      },
      audio: false,
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;

    await new Promise((resolve, reject) => {
      this.video.onloadedmetadata = () => {
        this.video.play().then(resolve).catch(reject);
      };
    });

    this.isReady = true;
    if (typeof this.onReady === 'function') this.onReady(this.video);
    return this.video;
  }

  /** Stop all tracks and release the camera. */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
      this.isReady = false;
    }
  }

  get width()  { return this.video.videoWidth  || 640; }
  get height() { return this.video.videoHeight || 480; }
}
