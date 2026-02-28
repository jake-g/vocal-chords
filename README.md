# Vocal Chords

[![View Demo](https://img.shields.io/badge/View-Demo-blue?style=for-the-badge)](https://jake-g.github.io/vocal-chords/)

A polyphonic synthesizer and interactive chord explorer built with React and the Web Audio API.

## Overview

A browser-based subtractive synthesizer that routes environmental inputs (camera, mouse, gyroscope) to modulate audio parameters in real-time.

## Implementation Details

*   **Audio Engine:** 4-voice polyphony via a custom `AudioContext` graph. Each voice uses three oscillators (A, B, C).
*   **Signal Flow:** `Oscillators -> Gain -> Lowpass Filter -> Voice Gain -> Master Gain -> Destination`.
*   **Smoothing:** `setTargetAtTime` prevents audio artifacts during rapid modulation.
*   **Input Normalization:** All inputs map to a `0.0` - `1.0` range.
*   **Sensors:** Webcam RGB/Brightness (via HTML5 Canvas), Mouse coordinates (`clientX/Y`), and Device Orientation (Tilt/Acceleration).
*   **State:** Relies on `useRef` and `requestAnimationFrame` to separate the high-frequency audio/animation loop from React renders.

## Controls

*   **Input Routing:** Map inputs to parameters (Cutoff, Detune, Volume, Chord). Adjust *Gain* (sensitivity) and *Inv* (invert signal).
*   **Oscillators:** Waveform shapes (Sine, Square, Saw, Triangle) and octave blending.
*   **Global Params:** Override Volume, Cutoff, Detune, and LFO (disabled when an input is routed to them).
*   **Chord Editor:** Define custom chords using relative semitone arrays (e.g., `[0, 4, 7, 11]`).

## Customization

Add permanent chord presets in `src/presets.js`:
*   **Format:** `[Note1, Note2, Note3, Note4]` (relative semitones). Stored as stringified arrays to allow comments.

## Setup & Deployment

**Prerequisites:** Node.js and npm.

```bash
git clone <repository-url>
cd vocal-chords
npm install
npm run dev # Local development server
```

**Deployment (GitHub Pages):**
```bash
npm run deploy # Builds and pushes to gh-pages branch
```

## Attribution

React implementation inspired by the original [Vocal Chords](https://github.com/PaulBatchelor) created by Paul Batchelor.