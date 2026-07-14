# 🕯️ LumaFlame — Virtual Candle Lighting

An interactive, cinematic web application that uses your webcam to track your hand. Bring your index finger tip to the candle's wick to ignite a realistic procedural flame with magical proximity responses.

---

## Features

- **Real-time Hand Tracking** — Powered by MediaPipe Hands (tracking landmark #8, index finger tip).
- **Proximity Ignition System** — The wick glows and releases gold particles as your finger approaches (outer 80px radius). Holding your finger inside the ignition zone (inner 20px radius) for 400ms triggers a spark burst and ignites the flame.
- **Volumetric Dynamic Light** — Realistic warm indirect illumination overlay centered on the flame that breathes naturally and scales with screen size.
- **Toggle Control** — Touch the flame/wick again after ignition to extinguish it, releasing rising wisps of smoke.
- **Performance Scaling** — Automatically scales particle counts and spawn rates based on device class (100% desktop, 75% tablet, 50% mobile) to ensure smooth 60fps rendering.
- **Responsive Aspect-Ratio Cover** — Custom canvas video mapping mirrors the camera feed and crops to cover the display area cleanly on both portrait and landscape viewports.
- **Retina & Safe Areas** — High-DPR canvas scaling guarantees crisp details on HiDPI/Retina screens, with layout protection for iPhone notch / Dynamic Island safe-area insets.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Structure | HTML5 semantic markup |
| Style | Vanilla CSS3 (custom variables, modern typography clamp, safe-area parameters) |
| Logic | Vanilla JavaScript (ES6 Modules) |
| Hand Tracking | MediaPipe Hands (via CDN) |
| Rendering | HTML5 Canvas 2D + requestAnimationFrame |

---

## Project Structure

```
fire/
├── index.html          ← Main viewport shell & MediaPipe CDN scripts
├── style.css           ← Dark ambient themes, animations, & safe-area responsive media queries
├── script.js           ← Main orchestrator, listener handlers, & coordinate mapping
├── assets/
│   └── candle.png      ← Gold ornate baroque candle holder (transparent background)
└── js/
    ├── camera.js       ← CameraManager (camera permissions & media stream setup)
    ├── handTracking.js ← HandTracker (MediaPipe initialization & tracking)
    ├── candle.js       ← State holder for candle status
    ├── collision.js    ← Backward compatibility placeholder
    ├── dynamicLight.js ← Volumetric breathing radial light source
    └── animation.js    ← AnimationEngine (DPR canvas rendering loop, physics, & drawing)
```

---

## Running Locally

Because ES6 modules require a secure server context or local server to prevent CORS issues, use a static server of your choice:

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .
```

Then open: **`http://localhost:8080`**

---

## Wick Calibration

The wick coordinate detection is calibrated precisely for `assets/candle.png`:
- Horizontal: `50%` of image width
- Vertical: `7%` from top of image boundary

To modify coordinate scaling or offset positioning, adjust `_getWickPos(W, H)` in [`js/animation.js`](js/animation.js).

---

## Browser Requirements

- Chrome 80+ / Edge 80+ / Firefox 75+ / Safari 14+
- Webcam permission allowed
- Internet connection (required to load MediaPipe WASM and Google Fonts from CDN)
