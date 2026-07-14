# 🕯️ Virtual Candle Lighting

An interactive web application that uses your webcam to detect your hand.  
Touch the candle's wick with your index finger tip to light it with a realistic flame.

---

## Features

- **Real-time Hand Tracking** — MediaPipe Hands (landmark #8, index finger tip)
- **Procedural Flame** — Multi-layer canvas-drawn flame with realistic flicker
- **Collision Detection** — Euclidean distance check against 30px wick radius
- **Particle System** — Floating ambient sparks + rising smoke
- **Warm Glow Effects** — Radial gradients, floor glow, vignette
- **Dark Magical UI** — Cormorant Garamond serif font, gold palette
- **Fully Responsive** — Desktop, tablet, mobile

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Structure | HTML5 semantic |
| Style | Vanilla CSS3 (custom properties, animations) |
| Logic | Vanilla JS ES6 Modules |
| Hand Tracking | MediaPipe Hands (CDN) |
| Rendering | HTML5 Canvas 2D + requestAnimationFrame |

---

## Project Structure

```
fire/
├── index.html          ← App shell + MediaPipe CDN scripts
├── style.css           ← Dark theme, candle/flame/glow styles
├── script.js           ← Main orchestrator (ES6 module)
├── js/
│   ├── camera.js       ← CameraManager (getUserMedia)
│   ├── handTracking.js ← HandTracker (MediaPipe wrapper)
│   ├── candle.js       ← Candle state + wick position
│   ├── collision.js    ← CollisionDetector (Euclidean dist)
│   └── animation.js    ← AnimationEngine (rAF render loop)
└── assets/
    └── lilin.png       ← Gold ornate candle holder (transparent bg)
```

---

## Running Locally

Because ES6 modules require a server (CORS), use any static server:

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code
Use "Live Server" extension → Right-click index.html → Open with Live Server
```

Then open: **http://localhost:8080**

---

## How It Works

1. **Camera** starts and webcam feed flows into MediaPipe
2. **MediaPipe Hands** detects landmark #8 (index finger tip) each frame
3. Coordinates are **mirrored** to match the CSS-flipped canvas
4. **Euclidean distance** is computed between finger tip and wick centre
5. If `dist < 30px` → **ignition fires** → flame animates in
6. The **AnimationEngine** draws everything via `requestAnimationFrame`

---

## Wick Calibration

The wick hit area is calibrated for `lilin.png`:
- Horizontal: 50% of image width
- Vertical: ~12.5% from top of image

To adjust, edit `_wickFracX` and `_wickFracY` in [`js/candle.js`](js/candle.js).

---

## Browser Requirements

- Chrome 80+ / Edge 80+ / Firefox 75+ / Safari 14+
- Webcam permission required
- Internet connection (for MediaPipe CDN + Google Fonts)
