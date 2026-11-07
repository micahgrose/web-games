// ── Procedural audio ───────────────────────────────────
// No asset files. Every cue is a pure function of
// (ctx, dest, t0) → endTime, so the identical code renders
// live through an AudioContext or offline for measurement.

let ctx = null;
let master = null;
let muted = false;

const NOISE_SECONDS = 1.4;
let noiseBuf = null;

function noiseBuffer(c) {
    if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
    const len = Math.floor(c.sampleRate * NOISE_SECONDS);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = buf;
    return buf;
}

/** Filtered noise burst. Paper and felt need a lowpass CAP or they
 *  read as tape hiss rather than as a material. */
function burst(c, dest, t0, {
    dur = 0.12, gain = 0.3, hp = 400, lp = 5200, q = 0.7,
    sweepTo = null, attack = 0.004, curve = 2.2,
} = {}) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const offset = Math.random() * (NOISE_SECONDS - dur - 0.05);

    const hpf = c.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = hp;
    hpf.Q.value = q;

    const lpf = c.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(lp, t0);
    if (sweepTo) lpf.frequency.exponentialRampToValueAtTime(Math.max(120, sweepTo), t0 + dur);

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.setTargetAtTime(0.0001, t0 + attack, dur / curve / 3);

    src.connect(hpf).connect(lpf).connect(g).connect(dest);
    src.start(t0, offset);
    src.stop(t0 + dur + 0.06);
    return t0 + dur + 0.06;
}

/** A struck partial. Bells are inharmonic — that's what sells metal. */
function tone(c, dest, t0, {
    freq = 440, dur = 0.5, gain = 0.2, type = 'sine',
    attack = 0.005, detune = 0, bend = null,
} = {}) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.detune.value = detune;
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(20, bend), t0 + dur);

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    // A pure exponential can't hold a long tail — hold, then release.
    g.gain.setValueAtTime(gain, t0 + attack);
    g.gain.setTargetAtTime(0.0001, t0 + attack + dur * 0.18, dur / 3.6);

    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.14);
    return t0 + dur + 0.14;
}

// ── The cue book ───────────────────────────────────────
export const CUES = {
    /** Riffle: a burst of paper edges, accelerating. */
    shuffle(c, dest, t0) {
        let end = t0;
        const n = 15;
        for (let i = 0; i < n; i++) {
            const t = t0 + Math.pow(i / n, 1.35) * 0.5;
            end = Math.max(end, burst(c, dest, t, {
                dur: 0.035, gain: 0.11, hp: 900, lp: 5400, sweepTo: 2600,
            }));
        }
        return end;
    },

    /** One card leaving the deck: a swish across felt. */
    deal(c, dest, t0) {
        const a = burst(c, dest, t0, { dur: 0.15, gain: 0.2, hp: 700, lp: 4600, sweepTo: 1500 });
        const b = tone(c, dest, t0 + 0.02, { freq: 150, bend: 92, dur: 0.1, gain: 0.05, type: 'triangle' });
        return Math.max(a, b);
    },

    /** The turn: a dry snap of stiff card stock. */
    flip(c, dest, t0) {
        const a = burst(c, dest, t0, { dur: 0.05, gain: 0.26, hp: 1500, lp: 7200, q: 1.1 });
        const b = tone(c, dest, t0, { freq: 320, bend: 170, dur: 0.06, gain: 0.07, type: 'square' });
        return Math.max(a, b);
    },

    /** Card lands on felt. */
    land(c, dest, t0) {
        const a = burst(c, dest, t0, { dur: 0.09, gain: 0.16, hp: 200, lp: 2100 });
        const b = tone(c, dest, t0, { freq: 104, bend: 62, dur: 0.14, gain: 0.11, type: 'sine' });
        return Math.max(a, b);
    },

    /** The verdict bell. Timbre and pitch encode the outcome band, so
     *  the ear learns the card ladder alongside the eye. */
    verdict(c, dest, t0, band = 'mixed') {
        const spec = {
            ruin:    { root: 138.6, dur: 1.5, gain: 0.15, parts: [1, 1.42, 2.31], type: 'triangle' },
            falter:  { root: 174.6, dur: 1.3, gain: 0.14, parts: [1, 1.51, 2.4],  type: 'triangle' },
            mixed:   { root: 261.6, dur: 1.4, gain: 0.13, parts: [1, 2.0, 2.98],  type: 'sine' },
            success: { root: 392.0, dur: 1.9, gain: 0.15, parts: [1, 2.0, 3.01, 4.02], type: 'sine' },
            triumph: { root: 523.3, dur: 2.6, gain: 0.16, parts: [1, 2.0, 3.0, 4.0, 6.0], type: 'sine' },
            fate:    { root: 466.2, dur: 2.8, gain: 0.13, parts: [1, 1.41, 2.37, 3.16, 4.71], type: 'sine' },
        }[band] || {};
        let end = t0;
        spec.parts.forEach((mult, i) => {
            end = Math.max(end, tone(c, dest, t0 + i * 0.012, {
                freq: spec.root * mult,
                dur: spec.dur * (1 - i * 0.1),
                gain: spec.gain / (1 + i * 1.15),
                type: spec.type,
                detune: band === 'fate' ? (i % 2 ? 14 : -14) : 0,
            }));
        });
        if (band === 'triumph' || band === 'success') {
            end = Math.max(end, burst(c, dest, t0, { dur: 0.5, gain: 0.035, hp: 3000, lp: 11000 }));
        }
        return end;
    },

    /** Two cards meeting in a counter. Inharmonic, brief, bright. */
    clash(c, dest, t0) {
        let end = burst(c, dest, t0, { dur: 0.07, gain: 0.3, hp: 2200, lp: 12000, q: 1.3 });
        [1046, 1478, 1961, 2637].forEach((f, i) => {
            end = Math.max(end, tone(c, dest, t0, {
                freq: f, dur: 0.5 - i * 0.08, gain: 0.075 / (i + 1), type: 'sine',
            }));
        });
        return end;
    },

    /** Someone is out. A low toll. */
    knell(c, dest, t0) {
        let end = t0;
        [1, 2.01, 2.79, 4.07].forEach((m, i) => {
            end = Math.max(end, tone(c, dest, t0 + i * 0.018, {
                freq: 98 * m, dur: 3.2 - i * 0.3, gain: 0.17 / (1 + i * 1.4), type: 'sine',
            }));
        });
        return end;
    },

    /** Your turn. Two soft notes, unhurried. */
    yours(c, dest, t0) {
        const a = tone(c, dest, t0, { freq: 587.3, dur: 0.4, gain: 0.09, type: 'sine', attack: 0.02 });
        const b = tone(c, dest, t0 + 0.13, { freq: 880, dur: 0.55, gain: 0.075, type: 'sine', attack: 0.02 });
        return Math.max(a, b);
    },

    /** Clock running out. */
    tick(c, dest, t0) {
        return burst(c, dest, t0, { dur: 0.03, gain: 0.09, hp: 1800, lp: 6000, q: 1.4 });
    },

    /** The last card falls. A warm, resolved chord. */
    victory(c, dest, t0) {
        let end = t0;
        [261.6, 329.6, 392.0, 523.3].forEach((f, i) => {
            end = Math.max(end, tone(c, dest, t0 + i * 0.11, {
                freq: f, dur: 3.4, gain: 0.1, type: 'sine', attack: 0.05,
            }));
        });
        [523.3, 659.3, 784.0].forEach((f, i) => {
            end = Math.max(end, tone(c, dest, t0 + 0.7 + i * 0.13, {
                freq: f, dur: 2.4, gain: 0.055, type: 'sine', attack: 0.04,
            }));
        });
        return end;
    },

    /** Quill on paper, under the narration. Kept far down in the mix. */
    scratch(c, dest, t0) {
        return burst(c, dest, t0, { dur: 0.022, gain: 0.028, hp: 2600, lp: 8000, q: 0.9 });
    },
};

// ── Live playback ──────────────────────────────────────
function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.55;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 5;
        comp.attack.value = 0.004;
        comp.release.value = 0.16;
        master.connect(comp).connect(ctx.destination);
    } catch { ctx = null; }
    return ctx;
}

export function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function play(name, ...args) {
    if (muted) return;
    const c = ensure();
    if (!c || !CUES[name]) return;
    if (c.state === 'suspended') return;   // waiting on a gesture
    try {
        CUES[name](c, master, c.currentTime + 0.006, ...args);
    } catch { /* never let a cue break the game */ }
}

export function setMuted(v) {
    muted = !!v;
    if (master) master.gain.value = muted ? 0 : 0.55;
    try { localStorage.setItem('crp_muted', muted ? '1' : '0'); } catch {}
    return muted;
}

export function isMuted() { return muted; }

export function restoreMute() {
    try { muted = localStorage.getItem('crp_muted') === '1'; } catch {}
    return muted;
}
