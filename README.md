# Vocal Chords

A polyphonic synthesizer and interactive chord explorer built with React and the Web Audio API.

## Overview

This application bridges browser-based sensors (camera, mouse position, device gyroscope) with a subtractive synthesis engine. It features a modular routing system allowing real-time modulation of synthesis parameters via environmental inputs.


## Implementation

### Audio Engine
*   **Web Audio API:** The core engine runs on a custom `AudioContext` graph.
*   **Polyphony:** Implements a 4-voice polyphonic allocation system. Each voice consists of three oscillators (A, B, C) with independent waveforms, octave offsets, and gain staging.
*   **Signal Flow:** `Oscillators -> Gain -> Lowpass Filter -> Voice Gain -> Master Gain -> Destination`.
*   **Smoothing:** Uses `setTargetAtTime` for parameter changes (frequency, gain, detune) to prevent audio artifacts (zippering) during rapid modulation.

### Input Routing & Sensor Fusion
The application normalizes all inputs to a floating-point range of `0.0` to `1.0`.
*   **Sources:**
    *   **Computer Vision:** An invisible HTML5 Canvas analyzes the webcam video feed frame-by-frame to extract average RGB and Brightness values.
    *   **Events:** Mouse coordinates (`clientX/Y`) and Device Orientation API (Tilt/Acceleration).
*   **Modulation Matrix:** Inputs are mapped to audio parameters (Cutoff, Detune, Volume, Chord Selection) via a gain stage and an inversion toggle.

### State Management
*   **React Hooks:** `useRef` is utilized heavily for the audio graph and sensor data to avoid React render cycles interrupting the high-frequency audio loop.
*   **Animation Loop:** A `requestAnimationFrame` loop handles the visual analysis and parameter interpolation separate from React's virtual DOM reconciliation.

## Controls

1.  **Input Routing:** Map physical/digital inputs to audio targets.
    *   *Gain:* Sensitivity of the input.
    *   *Inv:* Inverts the signal (1.0 - value).
2.  **Oscillators:** Configure waveform shapes (Sine, Square, Saw, Triangle) and octave blending.
3.  **Global Params:** Manual overrides for Volume, Filter Cutoff, Detune, and LFO Warp. (Manual controls are disabled if an Input Source is routed to them).
4.  **Chord Editor:** A text-based editor allowing the definition of custom harmonic structures using relative semitone arrays (e.g., `[0, 4, 7, 11]` for a Major 7th).

## Customization

The chord structures are defined in `src/presets.js`. You can edit this file to add permanent presets to the application.

*   **Syntax:** Presets are stored as stringified arrays to allow for comments.
*   **Format:** `[Note1, Note2, Note3, Note4]` (Relative semitones from the base note).
*   **Dynamic Loading:** New entries added to `presets.js` will automatically appear in the "Edit Chords" dropdown menu in the UI.

## Installation

Prerequisites: Node.js and NPM installed.

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd vocal-chords
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run local development server:**
    ```bash
    npm run dev
    ```

## Deployment

This project is configured for GitHub Pages using the `gh-pages` branch.

1.  **Build and Deploy:**
    The project includes a deployment script that builds the production assets and pushes them to the `gh-pages` branch automatically.
    ```bash
    npm run deploy
    ```

2.  **Verification:**
    Ensure your repository settings have GitHub Pages enabled and set to source from the `gh-pages` branch.


## Attribution

This project is an evolution and React implementation of the original **Vocal Chords** by **Paul Batchelor**.
Original Concept & Inspiration: [Paul Batchelor's Repository](https://github.com/PaulBatchelor)