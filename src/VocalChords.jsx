import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { Power } from 'lucide-react';
import { PRESETS } from './presets';

const BASE_NOTE = 63; // D#4
const midiToFreq = (note) => 440 * Math.pow(2, (note - 69) / 12);
const WAVES = ['sawtooth', 'square', 'sine', 'triangle'];

const SOURCES = [
  { id: 'none', label: 'NONE' },
  { id: 'camBright', label: 'CAM BRIGHT' },
  { id: 'camRed', label: 'CAM RED' },
  { id: 'camGreen', label: 'CAM GREEN' },
  { id: 'camBlue', label: 'CAM BLUE' },
  { id: 'cursorY', label: 'CURSOR Y' },
  { id: 'cursorX', label: 'CURSOR X' },
  { id: 'keyboard', label: 'KEYBOARD' },
  { id: 'tilt', label: 'PHONE TILT' },
  { id: 'motionX', label: 'PHONE SHAKE' },
];
const TARGETS = [
  { id: 'chord', label: 'CHORD' },
  { id: 'cutoff', label: 'FILTER' },
  { id: 'detune', label: 'DETUNE' },
  { id: 'volume', label: 'VOLUME' },
  { id: 'lfoDepth', label: 'WARP' },
];

// Helper: Linear Interpolation
const lerp = (start, end, factor) => start + (end - start) * factor;

export default function VocalChordsPresets() {
  // --- State ---
  const [started, setStarted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState("Initializing...");
  const [needsResume, setNeedsResume] = useState(false);
  const [enableLogs, setEnableLogs] = useState(false);

  // Manual Params
  const [params, setParams] = useState({
    activeChord: 0,
    volume: 0.2,
    detune: 0,
    lfoDepth: 5, 
    lfoRate: 0.2, 
    cutoff: 1000,
    sensitivity: 2.0
  });

  // Inputs Config
  const [inputs, setInputs] = useState({
    1: { source: 'keyboard', target: 'chord', gain: 1.0, invert: false },
    2: { source: 'cursorY', target: 'cutoff', gain: 1.0, invert: false },
    3: { source: 'cursorX', target: 'detune', gain: 1.0, invert: false }
  });

  // Oscillators (Standard)
  const [oscA, setOscA] = useState({ type: 'triangle', octave: 0, gain: 0.5, enabled: true });
  const [oscB, setOscB] = useState({ type: 'sine', octave: 0, gain: 0.5, enabled: true });
  const [oscC, setOscC] = useState({ type: 'square', octave: -1, gain: 0.5, enabled: false });

  // Data
  const [showEditor, setShowEditor] = useState(false);
  const [editorText, setEditorText] = useState(PRESETS.lofi_pad);
  const [chords, setChords] = useState(() => {
    try { return new Function("return " + PRESETS["lofi_pad"])(); } catch { return []; }
  });
  const [errorMsg, setErrorMsg] = useState(null);

  // --- Refs ---
  const inputsRef = useRef(inputs);
  const paramsRef = useRef(params);
  const audioCtxRef = useRef(null);
  const masterGainRef = useRef(null);
  const voicesRef = useRef([]); 
  const lfoRef = useRef(null);
  const lfoGainRef = useRef(null);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const reqIdRef = useRef(null);
  
  const sensorsRef = useRef({ 
      camBright: 0, camRed: 0, camGreen: 0, camBlue: 0,
      keyboard: 0, cursorX: 0.5, cursorY: 0.5, 
      tilt: 0.5, motionX: 0.5, none: 0 
  });
  const prevInputsRef = useRef({ 1: 0, 2: 0, 3: 0 });
  const visualActivityRef = useRef(0);
  const visualOverlayRef = useRef(null);
  
  const uiRefs = {
    volume: useRef(null),
    cutoff: useRef(null),
    detune: useRef(null),
    lfoDepth: useRef(null)
  };

  // --- Sync State to Refs (Fixes Initialization Bug) ---
  useLayoutEffect(() => { inputsRef.current = inputs; }, [inputs]);
  useLayoutEffect(() => { paramsRef.current = params; }, [params]);

  // Helper
  const isControlled = (targetId) => Object.values(inputs).some(i => i.target === targetId && i.source !== 'none');

  // --- Audio Engine ---
  const initAudio = useCallback(() => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
    const ctx = audioCtxRef.current;

    if (ctx.state === 'suspended') {
        setNeedsResume(true);
        setStatus("CLICK TO START");
    } else {
        setStatus("ONLINE");
    }

    voicesRef.current.forEach(v => {
        try { v.oscA.stop(); v.oscB.stop(); v.oscC.stop(); } catch(e){}
        v.gain.disconnect();
    });

    if (!masterGainRef.current) {
        masterGainRef.current = ctx.createGain();
        masterGainRef.current.connect(ctx.destination);
    }
    masterGainRef.current.gain.value = params.volume;

    if (!lfoRef.current) {
        lfoRef.current = ctx.createOscillator();
        lfoGainRef.current = ctx.createGain();
        lfoRef.current.connect(lfoGainRef.current);
        lfoRef.current.start();
    }
    lfoRef.current.frequency.value = params.lfoRate;
    lfoGainRef.current.gain.value = params.lfoDepth;

    // Build 4 Polyphonic Voices
    voicesRef.current = [0, 1, 2, 3].map(() => {
        const voiceGain = ctx.createGain();
        const voiceFilter = ctx.createBiquadFilter();
        voiceFilter.type = 'lowpass';
        voiceFilter.frequency.value = params.cutoff;

        const createOsc = (config) => {
            const osc = ctx.createOscillator();
            osc.type = config.type;
            const gain = ctx.createGain();
            lfoGainRef.current.connect(osc.detune);
            osc.connect(gain);
            gain.connect(voiceFilter);
            osc.start();
            return { osc, gain };
        };

        const chA = createOsc(oscA);
        const chB = createOsc(oscB);
        const chC = createOsc(oscC);

        voiceFilter.connect(voiceGain);
        voiceGain.connect(masterGainRef.current);

        return { 
            oscA: chA.osc, gainA: chA.gain,
            oscB: chB.osc, gainB: chB.gain,
            oscC: chC.osc, gainC: chC.gain,
            filter: voiceFilter, 
            gain: voiceGain 
        };
    });

    updateMixer();
    playChord(params.activeChord);

  }, [oscA.type, oscB.type, oscC.type]);

  // --- Logic ---
  const updateMixer = useCallback(() => {
      if (!audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;

      voicesRef.current.forEach(v => {
          v.gainA.gain.setTargetAtTime(oscA.enabled ? oscA.gain : 0, now, 0.05);
          v.gainB.gain.setTargetAtTime(oscB.enabled ? oscB.gain : 0, now, 0.05);
          v.gainC.gain.setTargetAtTime(oscC.enabled ? oscC.gain : 0, now, 0.05);
          
          if (params.detune > 0) {
              v.oscA.detune.setValueAtTime(-params.detune, now);
              v.oscB.detune.setValueAtTime(0, now);
              v.oscC.detune.setValueAtTime(params.detune, now);
          } else {
              v.oscA.detune.setValueAtTime(0, now);
              v.oscB.detune.setValueAtTime(0, now);
              v.oscC.detune.setValueAtTime(0, now);
          }
      });
      lfoRef.current.frequency.setTargetAtTime(params.lfoRate, now, 0.1);

  }, [oscA, oscB, oscC, params.detune, params.lfoRate]);

  useEffect(() => { updateMixer(); }, [updateMixer]);

  const playChord = useCallback((chordIndex) => {
      if (!voicesRef.current.length || !chords.length || !audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      // Wrap index if chords array shrank
      const safeIndex = chordIndex % chords.length;
      const chord = chords[safeIndex] || chords[0];
      const baseNotes = chord.map(n => BASE_NOTE + n);

      voicesRef.current.forEach((voice, i) => {
          // Cycle through notes if chord has fewer than 4, or clamp
          const noteIndex = i % baseNotes.length;
          const note = baseNotes[noteIndex];
          
          const freqA = midiToFreq(note + (oscA.octave * 12));
          const freqB = midiToFreq(note + (oscB.octave * 12));
          const freqC = midiToFreq(note + (oscC.octave * 12));

          // 1. Cut Volume (Fade Out 15ms)
          voice.gain.gain.cancelScheduledValues(now);
          voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
          voice.gain.gain.linearRampToValueAtTime(0, now + 0.015);

          // 2. Snap Pitch
          voice.oscA.frequency.setValueAtTime(freqA, now + 0.02);
          voice.oscB.frequency.setValueAtTime(freqB, now + 0.02);
          voice.oscC.frequency.setValueAtTime(freqC, now + 0.02);

          // 3. Attack (Fade In)
          voice.gain.gain.linearRampToValueAtTime(1.0, now + 0.05);
      });
  }, [chords, oscA.octave, oscB.octave, oscC.octave]);

  useEffect(() => {
      if (started && !paused && audioCtxRef.current?.state === 'running') {
          // Ensure index is valid for current chords length
          if (params.activeChord >= chords.length) {
              setParams(p => ({...p, activeChord: 0}));
          } else {
              playChord(params.activeChord);
              if (enableLogs) {
                  const currentChord = chords[params.activeChord] || chords[0];
                  console.log("Chord Change:", { 
                      idx: params.activeChord + 1, 
                      chord: currentChord, 
                      params 
                  });
              }
          }
      }
  }, [params.activeChord, oscA.octave, oscB.octave, oscC.octave, chords, initAudio, enableLogs]);

  // --- Loop ---
  const updateParam = (key, val) => setParams(p => ({ ...p, [key]: val }));

  const updateLoop = useCallback(() => {
    if (paused) return;

    // 1. Camera Processing (Smoothed)
    const camActive = Object.values(inputsRef.current).some(i => i.source.startsWith('cam'));
    if (camActive && videoRef.current && canvasRef.current) {
        if (videoRef.current.readyState === 4) {
            const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(videoRef.current, 0, 0, 32, 32);
            const frame = ctx.getImageData(0, 0, 32, 32);
            let sumR=0, sumG=0, sumB=0;
            const len = frame.data.length;
            for (let i = 0; i < len; i += 4) {
                sumR += frame.data[i];
                sumG += frame.data[i+1];
                sumB += frame.data[i+2];
            }
            const pxCount = len / 4;
            const targetRed = (sumR / pxCount) / 255;
            const targetGreen = (sumG / pxCount) / 255;
            const targetBlue = (sumB / pxCount) / 255;
            const targetBright = (targetRed + targetGreen + targetBlue) / 3;

            const s = sensorsRef.current;
            s.camRed = lerp(s.camRed, targetRed, 0.1);
            s.camGreen = lerp(s.camGreen, targetGreen, 0.1);
            s.camBlue = lerp(s.camBlue, targetBlue, 0.1);
            s.camBright = lerp(s.camBright, targetBright, 0.1);
        }
    }

    // 2. Process Inputs & Entropy
    const cv = { ...paramsRef.current };
    const currentInputs = inputsRef.current;
    let totalEntropy = 0;

    [1, 2, 3].forEach(id => {
        const config = currentInputs[id];
        if (config.source === 'none') return;
        
        let val = sensorsRef.current[config.source];
        
        if (config.invert) val = 1 - val;
        val = Math.min(Math.max(val * config.gain, 0), 1); 

        // Entropy
        const prevVal = prevInputsRef.current[id] || 0;
        totalEntropy += Math.abs(val - prevVal) * 2;
        prevInputsRef.current[id] = val;

        if (config.target === 'chord') {
            const numChords = chords.length;
            // Map 0-1 to 0-(N-1)
            const idx = Math.min(numChords - 1, Math.floor(val * numChords));
            if (idx !== cv.activeChord) {
                cv.activeChord = idx;
                updateParam('activeChord', idx); // Triggers effect
            }
        } 
        else if (config.target === 'cutoff') {
            cv.cutoff = 200 + (val * 4800);
            if (uiRefs.cutoff.current) uiRefs.cutoff.current.value = cv.cutoff;
        }
        else if (config.target === 'detune') {
            cv.detune = val * 25; 
            if (uiRefs.detune.current) uiRefs.detune.current.value = cv.detune;
        }
        else if (config.target === 'volume') {
            cv.volume = val * 0.5;
            if (uiRefs.volume.current) uiRefs.volume.current.value = cv.volume;
        }
        else if (config.target === 'lfoDepth') {
            cv.lfoDepth = val * 100; 
            if (uiRefs.lfoDepth.current) uiRefs.lfoDepth.current.value = cv.lfoDepth;
        }
    });

    // 3. Visual Pulse (Activity Decay)
    visualActivityRef.current = lerp(visualActivityRef.current, totalEntropy, 0.1);
    if (visualOverlayRef.current) {
        // Map activity to white opacity (max 0.9)
        const intensity = Math.min(visualActivityRef.current * 10, 0.9);
        visualOverlayRef.current.style.backgroundColor = `rgba(255, 255, 255, ${intensity})`;
    }

    // 4. Audio Updates
    if (audioCtxRef.current) {
        const now = audioCtxRef.current.currentTime;
        voicesRef.current.forEach(v => v.filter.frequency.setTargetAtTime(cv.cutoff, now, 0.1));
        
        // Manual updates for continuous params
        const detuneTarget = Object.values(currentInputs).some(i => i.target === 'detune' && i.source !== 'none') ? cv.detune : paramsRef.current.detune;
        voicesRef.current.forEach(v => {
             v.oscA.detune.setTargetAtTime(-detuneTarget, now, 0.1);
             v.oscB.detune.setTargetAtTime(0, now, 0.1);
             v.oscC.detune.setTargetAtTime(detuneTarget, now, 0.1);
        });
        
        const volTarget = Object.values(currentInputs).some(i => i.target === 'volume' && i.source !== 'none') ? cv.volume : paramsRef.current.volume;
        masterGainRef.current.gain.setTargetAtTime(volTarget, now, 0.05);
        
        const lfoTarget = Object.values(currentInputs).some(i => i.target === 'lfoDepth' && i.source !== 'none') ? cv.lfoDepth : paramsRef.current.lfoDepth;
        lfoGainRef.current.gain.setTargetAtTime(lfoTarget, now, 0.1);
    }

    reqIdRef.current = requestAnimationFrame(updateLoop);
  }, [paused, chords]); 

  // --- Effects ---
  useEffect(() => {
    initAudio();
    reqIdRef.current = requestAnimationFrame(updateLoop);
    
    const resume = () => {
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume().then(() => setStatus("Online"));
        }
    };
    window.addEventListener('click', resume);
    window.addEventListener('keydown', resume);

    const keyMap = { '1':0, '2':1, '3':2, '4':3, '5':4, '6':5, '7':6, '8':7, '9':8, '0':9, '-':10, '=':11 };
    const handleKey = (e) => {
        if (e.code === 'Space') { e.preventDefault(); togglePause(); }
        if (keyMap.hasOwnProperty(e.key)) {
            const idx = keyMap[e.key];
            const numChords = chords.length;
            if (idx < numChords) {
                const sensorVal = (idx + 0.5) / numChords;
                sensorsRef.current.keyboard = sensorVal;
                if (inputsRef.current[1].source === 'keyboard') {
                    updateParam('activeChord', idx); 
                }
            }
        }
    };
    const handleMove = (e) => {
        sensorsRef.current.cursorX = Math.min(Math.max(e.clientX / window.innerWidth, 0), 1);
        sensorsRef.current.cursorY = 1 - Math.min(Math.max(e.clientY / window.innerHeight, 0), 1);
    };
    const handleTilt = (e) => {
        const t = (Math.min(Math.max(e.beta, -45), 45) + 45) / 90;
        sensorsRef.current.tilt = lerp(sensorsRef.current.tilt, t, 0.1);
    };
    const handleMotion = (e) => {
        if (e.accelerationIncludingGravity) {
            const m = Math.min(Math.max((e.accelerationIncludingGravity.x + 10) / 20, 0), 1);
            sensorsRef.current.motionX = lerp(sensorsRef.current.motionX, m, 0.1);
        }
    };

    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('deviceorientation', handleTilt);
    window.addEventListener('devicemotion', handleMotion);

    if (Object.values(inputs).some(i => i.source.startsWith('cam'))) {
        navigator.mediaDevices.getUserMedia({ video: { width: 64, height: 64 } })
            .then(s => { if(videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); } })
            .catch(e => setErrorMsg("Cam Blocked"));
    }

    return () => {
        window.removeEventListener('click', resume);
        window.removeEventListener('keydown', handleKey);
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('deviceorientation', handleTilt);
        window.removeEventListener('devicemotion', handleMotion);
        if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
    };
  }, [started, inputs, chords]);

  const togglePause = () => {
      setPaused(p => {
          const next = !p;
          if (audioCtxRef.current) {
              if (next) {
                  audioCtxRef.current.suspend();
                  cancelAnimationFrame(reqIdRef.current);
              } else {
                  audioCtxRef.current.resume();
                  reqIdRef.current = requestAnimationFrame(updateLoop);
              }
          }
          return next;
      });
  };

  const handleChordClick = (index) => {
      updateParam('activeChord', index);
      const sensorVal = (index + 0.5) / chords.length;
      sensorsRef.current.keyboard = sensorVal;
  };

  const loadPreset = (key) => {
      if (PRESETS[key]) {
          setEditorText(PRESETS[key]);
      }
  };

  const handleEditorSave = () => {
      try {
          const parsed = new Function("return " + editorText)();
          if(!Array.isArray(parsed)) throw new Error("Must be an array");
          setChords(parsed);
          setErrorMsg(null);
          setShowEditor(false);
          if (params.activeChord >= parsed.length) {
              setParams(p => ({...p, activeChord: 0}));
          }
      } catch(e) { setErrorMsg(e.message); }
  };

  const renderOscControl = (label, state, setState) => (
    <div className="flex items-center gap-2 border-b border-gray-300 pb-2 last:border-0 h-8">
        <span className="font-bold w-4">{label}</span>
        <select value={state.type} onChange={e => setState({...state, type: e.target.value})} className="bg-white border border-gray-400 p-1 flex-1 uppercase text-[10px] font-bold h-full">
            {WAVES.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <div className="flex items-center border border-black px-1 bg-white h-full">
            <button onClick={() => setState({...state, octave: Math.max(-2, state.octave - 1)})} className="px-1 font-bold hover:bg-gray-200 text-[10px]">-</button>
            <span className="w-3 text-center text-[10px] font-bold">{state.octave}</span>
            <button onClick={() => setState({...state, octave: Math.min(2, state.octave + 1)})} className="px-1 font-bold hover:bg-gray-200 text-[10px]">+</button>
        </div>
        <input type="range" min="0" max="1" step="0.01" value={state.gain} onChange={e => setState({...state, gain: Number(e.target.value)})} className="w-12 accent-black" title="Gain"/>
        <button onClick={() => setState({...state, enabled: !state.enabled})} className={`w-8 h-full flex items-center justify-center border border-black text-[10px] font-bold transition-colors ${state.enabled ? 'bg-black text-white' : 'bg-white text-black'}`}>
            {state.enabled ? 'ON' : 'OFF'}
        </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-black font-mono p-4 flex flex-col items-center select-none">
      
      {/* HEADER */}
      <div className="w-full max-w-4xl border-b-2 border-black mb-6 pb-2 flex justify-between items-end">
        <h1 className="text-2xl md:text-4xl font-bold tracking-tighter">VOCAL CHORDS</h1>
        <div className="flex gap-4 items-center">
            <button onClick={() => setEnableLogs(!enableLogs)} className={`text-[10px] font-bold px-2 py-1 border border-black ${enableLogs ? 'bg-black text-white' : 'bg-white'}`}>LOGS</button>
            <button onClick={(e) => { e.stopPropagation(); togglePause(); }} className="text-[10px] font-bold px-2 py-1 border border-black hover:bg-gray-200">{paused ? "RESUME" : "PAUSE"}</button>
            <button onClick={() => setShowEditor(!showEditor)} className="text-[10px] font-bold px-2 py-1 border border-black hover:bg-gray-200">EDIT CHORDS</button>
        </div>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-8 pb-20">
            
            {/* LEFT COLUMN: SETTINGS */}
            <div className="space-y-6">
                
                <fieldset className="border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]">
                    <legend className="font-bold px-2 bg-white">INPUT ROUTING</legend>
                    <div className="space-y-4 text-xs md:text-sm">
                        {[1, 2, 3].map(num => (
                            <div key={num} className="flex flex-col gap-1 border-b border-gray-200 pb-2 last:border-0">
                                <div className="flex gap-2 items-center">
                                    <span className="font-bold w-4">{num}.</span>
                                    <select value={inputs[num].source} onChange={e => setInputs(prev => ({...prev, [num]: {...prev[num], source: e.target.value}}))} className="bg-gray-100 border border-black p-1 font-bold outline-none flex-1 text-[10px]">
                                        {SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                    </select>
                                    <span className="font-bold">→</span>
                                    <select value={inputs[num].target} onChange={e => setInputs(prev => ({...prev, [num]: {...prev[num], target: e.target.value}}))} className="bg-gray-100 border border-black p-1 font-bold outline-none flex-1 text-[10px]">
                                        {TARGETS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 pl-6">
                                    <span className="font-bold text-[10px]">GAIN</span>
                                    <input type="range" min="0.1" max="4" step="0.01" value={inputs[num].gain} onChange={e => setInputs(prev => ({...prev, [num]: {...prev[num], gain: Number(e.target.value)}}))} className="flex-1 h-1 accent-black"/>
                                    <button onClick={() => setInputs(prev => ({...prev, [num]: {...prev[num], invert: !prev[num].invert}}))} className={`text-[10px] font-bold px-1 border border-black ${inputs[num].invert ? 'bg-black text-white' : 'bg-white text-black'}`}>INV</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </fieldset>

                <fieldset className="border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] bg-gray-50">
                    <legend className="font-bold px-2 bg-gray-50">OSCILLATORS</legend>
                    <div className="space-y-4 text-xs md:text-sm">
                        {renderOscControl("A", oscA, setOscA)}
                        {renderOscControl("B", oscB, setOscB)}
                        {renderOscControl("C", oscC, setOscC)}
                    </div>
                </fieldset>
                
                <fieldset className="border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]">
                    <legend className="font-bold px-2 bg-white">CONTROLS</legend>
                    <div className="grid grid-cols-[70px_1fr_40px] gap-y-3 gap-x-2 items-center font-bold text-xs md:text-sm">
                        
                        <span>VOLUME</span>
                        <input ref={uiRefs.volume} type="range" min="0" max="0.5" step="0.01" defaultValue={params.volume} onChange={e=>!isControlled('volume') && updateParam('volume', Number(e.target.value))} disabled={isControlled('volume')} className={`accent-black ${isControlled('volume') ? 'opacity-50 cursor-not-allowed' : ''}`} />
                        <span>{isControlled('volume') ? 'AUTO' : Math.round(params.volume*100)}</span>

                        <span>FILTER</span>
                        <input ref={uiRefs.cutoff} type="range" min="200" max="5000" step="10" defaultValue={params.cutoff} onChange={e=>!isControlled('cutoff') && updateParam('cutoff', Number(e.target.value))} disabled={isControlled('cutoff')} className={`accent-black ${isControlled('cutoff') ? 'opacity-50 cursor-not-allowed' : ''}`} />
                        <span>{Math.round(params.cutoff/100)}</span>

                        <span>DETUNE</span>
                        <input ref={uiRefs.detune} type="range" min="0" max="25" step="0.1" defaultValue={params.detune} onChange={e=>!isControlled('detune') && updateParam('detune', Number(e.target.value))} disabled={isControlled('detune')} className={`accent-black ${isControlled('detune') ? 'opacity-50 cursor-not-allowed' : ''}`} />
                        <span>{params.detune}</span>

                        <span>WARP</span>
                        <input ref={uiRefs.lfoDepth} type="range" min="0" max="100" step="1" defaultValue={params.lfoDepth} onChange={e=>!isControlled('lfoDepth') && updateParam('lfoDepth', Number(e.target.value))} disabled={isControlled('lfoDepth')} className={`accent-black ${isControlled('lfoDepth') ? 'opacity-50 cursor-not-allowed' : ''}`} />
                        <span>{params.lfoDepth}</span>
                    </div>
                </fieldset>
            </div>

            {/* RIGHT COLUMN: VISUALS */}
            <div className="space-y-6 flex flex-col h-full">
                
                <div className="w-full aspect-video md:aspect-square bg-black relative border-2 border-black flex items-center justify-center overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] group shrink-0">
                    <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover opacity-40 grayscale contrast-125" muted playsInline />
                    
                    {/* Visual Entropy Overlay */}
                    <div ref={visualOverlayRef} className="absolute inset-0 transition-colors duration-75 pointer-events-none" style={{backgroundColor: 'rgba(255,255,255,0)'}}></div>

                    <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,0,0.1)_1px,transparent_1px)] bg-[size:20px_20px]"></div>

                    <div className="relative z-10 text-white text-center mix-blend-difference">
                        <div className="text-8xl font-black tracking-tighter">{params.activeChord + 1}</div>
                        <div className="text-sm font-mono uppercase tracking-widest mt-2 border-t border-white pt-1">
                            {chords[params.activeChord] ? chords[params.activeChord].join('  ') : '0 0 0 0'}
                        </div>
                    </div>
                </div>

                {showEditor ? (
                    <div className="border-2 border-black p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] flex-1 flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-sm">CHORD EDITOR</span>
                            <select onChange={(e) => loadPreset(e.target.value)} className="text-xs bg-gray-100 border border-black p-1 font-bold outline-none max-w-[200px]">
                                {Object.keys(PRESETS).map(key => (
                                    <option key={key} value={key}>
                                        {key.replace(/_/g, ' ').toUpperCase()}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <textarea value={editorText} onChange={e => setEditorText(e.target.value)} className="w-full flex-1 font-mono text-xs border border-gray-400 p-2 bg-gray-50 focus:outline-none focus:border-black resize-none" spellCheck="false" />
                        <div className="flex justify-between items-center mt-3">
                            <span className="text-red-600 text-xs font-bold">{errorMsg}</span>
                            <button onClick={handleEditorSave} className="bg-black text-white px-6 py-2 text-xs font-bold hover:bg-gray-800">COMPILE</button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-4 gap-3 flex-1 content-start">
                        {chords.map((_, i) => (
                            <button key={i} onClick={() => handleChordClick(i)} className={`h-16 border-2 border-black flex items-center justify-center font-bold text-xl transition-all ${i === params.activeChord ? 'bg-black text-white shadow-[2px_2px_0px_0px_rgba(100,100,100,1)] translate-y-[-2px]' : 'bg-white text-black hover:bg-gray-100'}`}>
                                {i + 1}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            
            <canvas ref={canvasRef} width="32" height="32" className="hidden" />
      </div>
    </div>
  );
}