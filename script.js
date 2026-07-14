/**
 * script.js — Main entry point (ES6 Module)
 *
 * Boot order:
 *   1. CameraManager    → webcam stream
 *   2. AnimationEngine  → render loop (candle drawn on canvas)
 *   3. HandTracker      → MediaPipe, finger coords
 *   4. Candle           → state holder (toggle support)
 *   5. CollisionDetector → ignition + extinguish trigger
 */

import { CameraManager }     from './js/camera.js';
import { HandTracker }       from './js/handTracking.js';
import { Candle }            from './js/candle.js';
import { CollisionDetector } from './js/collision.js';
import { AnimationEngine }   from './js/animation.js';

/* ══════════════════════════════════════════════════════════════
   DOM references
══════════════════════════════════════════════════════════════ */
const loadingScreen = document.getElementById('loading-screen');
const viewport      = document.getElementById('viewport');
const webcamEl      = document.getElementById('webcam');
const mainCanvas    = document.getElementById('main-canvas');
const candleImg     = document.getElementById('candle-img');
const statusChip    = document.getElementById('status-chip');
const statusText    = document.getElementById('status-text');

/* ══════════════════════════════════════════════════════════════
   Status helper
══════════════════════════════════════════════════════════════ */
function setStatus(message, state = '') {
  statusText.textContent = message;
  statusChip.className   = state; // '' | 'active' | 'tracking'
}

/* ══════════════════════════════════════════════════════════════
   Canvas sizing
══════════════════════════════════════════════════════════════ */
function resizeCanvas() {
  if (engine) engine.resize(viewport.clientWidth, viewport.clientHeight);
}

/* ══════════════════════════════════════════════════════════════
   Module instances
══════════════════════════════════════════════════════════════ */
let camera   = null;
let tracker  = null;
let candle   = null;
let detector = null;
let engine   = null;

/* ══════════════════════════════════════════════════════════════
   Ignition handler
══════════════════════════════════════════════════════════════ */
function handleIgnite() {
  console.log('[VCL] 🕯️  Candle ignited!');
  if (candle) candle.light();
  setStatus('Candle Lit', 'active');
}

/* ══════════════════════════════════════════════════════════════
   Extinguish handler
══════════════════════════════════════════════════════════════ */
function handleExtinguish() {
  console.log('[VCL] 💨  Candle extinguished!');
  if (candle) candle.extinguish();
  setStatus('Waiting...', 'active');
}

/* ══════════════════════════════════════════════════════════════
   Per-frame logic hook (injected into engine._frame)
══════════════════════════════════════════════════════════════ */
function onBeforeFrame() {
  const W = mainCanvas.width;
  const H = mainCanvas.height;

  // Map normalised MediaPipe coords → canvas pixel coords
  if (tracker) tracker.updateScreenCoords(W, H);

  // Sync finger position to engine for rendering
  if (engine) {
    engine.fingerPos = tracker?.indexTipScreen ?? null;

    // Dynamically synchronize the status chip with engine states
    const state = engine.interactionState;
    if (state === 'Waiting...') {
      setStatus('Waiting...', 'active');
    } else if (state === 'Finger Detected') {
      setStatus('Finger Detected', 'tracking');
    } else if (state === 'Ready to Ignite') {
      setStatus('Ready to Ignite', 'tracking');
    } else if (state === 'Igniting...') {
      setStatus('Igniting...', 'tracking');
    } else if (state === 'Candle Lit') {
      setStatus('Candle Lit', 'active');
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   Boot sequence
══════════════════════════════════════════════════════════════ */
async function init() {
  setStatus('Starting camera…');

  try {
    /* ── 1. Camera ─────────────────────── */
    camera = new CameraManager(webcamEl);
    await camera.start();
    setStatus('Camera ready', 'active');

    /* ── 2. Canvas size ────────────────── */
    resizeCanvas();
    window.addEventListener('resize', debounce(resizeCanvas, 120));

    /* ── 3. Preload candle image ────────── */
    await waitForImage(candleImg);

    /* ── 4. Animation engine ────────────── */
    engine = new AnimationEngine(mainCanvas, webcamEl, candleImg);
    engine.onIgnite     = handleIgnite;
    engine.onExtinguish = handleExtinguish;

    // Inject per-frame hook
    const _origFrame = engine._frame.bind(engine);
    engine._frame = function() {
      onBeforeFrame();
      _origFrame();
    };

    engine.resize(viewport.clientWidth, viewport.clientHeight);
    engine.start();

    /* ── 5. Candle state ────────────────── */
    candle = new Candle();

    /* ── 6. Hand tracker ────────────────── */
    setStatus('Loading AI model…');
    tracker = new HandTracker(webcamEl, {
      minDetectionConfidence: 0.72,
      minTrackingConfidence:  0.65,
    });

    tracker.onHandLost = () => {
      if (engine) {
        engine.fingerPos = null;
        engine.interactionState = 'Waiting...';
      }
      setStatus('Waiting...', 'active');
    };

    await tracker.init();
    setStatus('Waiting...', 'active');

    /* ── 7. Collision detector ──────────── */
    // Kept for backward compatibility and clean modularity
    detector = new CollisionDetector(candle, tracker, engine);
    detector.onIgnite     = handleIgnite;
    detector.onExtinguish = handleExtinguish;

    /* ── 8. Hide loading screen ─────────── */
    loadingScreen.classList.add('fade-out');

  } catch (err) {
    console.error('[VCL] Init failed:', err);
    loadingScreen.classList.add('fade-out');
    showError(err);
  }
}

/* ══════════════════════════════════════════════════════════════
   Utilities
══════════════════════════════════════════════════════════════ */
function waitForImage(img) {
  return new Promise(resolve => {
    if (img.complete && img.naturalWidth > 0) return resolve();
    img.onload  = resolve;
    img.onerror = resolve;
  });
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function showError(err) {
  const isCam = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
  const msg = isCam
    ? '📷 Akses kamera ditolak.\nHarap izinkan akses kamera dan refresh halaman.'
    : `⚠️ Terjadi kesalahan:\n${err.message || err}`;

  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;
    align-items:center;justify-content:center;background:rgba(5,3,2,0.94);
    color:#f5e6c8;font-family:'Cormorant Garamond',serif;
    text-align:center;padding:40px 24px;gap:20px;
  `;
  el.innerHTML = `
    <div style="font-size:2.5rem">🕯️</div>
    <p style="font-size:1rem;line-height:1.75;white-space:pre-line;color:rgba(245,230,200,0.8)">${msg}</p>
    <button onclick="location.reload()" style="
      margin-top:16px;padding:10px 28px;border-radius:999px;
      border:1px solid rgba(255,180,60,0.4);background:rgba(255,160,40,0.12);
      color:#f0c060;font-family:inherit;font-size:0.9rem;letter-spacing:0.15em;cursor:pointer;
    ">Coba Lagi</button>
  `;
  document.body.appendChild(el);
}

/* ══════════════════════════════════════════════════════════════
   Start!
══════════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', init);
