# SOUND TESTING

A workbench for learning what actually makes a synthesized sound land, one sound
family at a time. Currently: **creaks**.

## How a round works

1. I build **three candidates that differ in mechanism**, not in parameters.
   Parameter tweaks teach nothing about why a sound works; swapping the physics
   does. Every candidate is level-matched first, or the round measures loudness
   instead of timbre.
2. You open `index.html`, click each, and tell me **which is closest and why**.
   The *why* is the whole point — "too buzzy", "too regular", "sounds like a
   synth sweep", "the ending is wrong" each point at a different fix.
3. I build three more from what that told me. Repeat until one lands.
4. Findings go in `NOTES.md`, and the durable ones go into my memory.

## Files

- `index.html` — the audition page. Open it directly; no server needed.
- `js/creaks.js` — every candidate, plus the shared synthesis primitives.
  Loads in both the browser and node so the sound you hear is the same code I
  measure.
- `test/measure.js` — renders each candidate offline through a real WebAudio
  implementation and reports duration, level, spectral centroid and its
  trajectory, tonal-vs-noisy, onset count, onset irregularity, and the f0
  contour (early → late → tail).

```
node test/measure.js              # median of 7 renders, plus sanity checks
node test/measure.js --reps 15    # more renders (these sounds are stochastic)
node test/measure.js --wav out    # also dump WAVs
node test/measure.js r1a r1c      # only these candidates
```

Needs `node-web-audio-api`; it falls back to the copy already installed under
`Claude Games/Lampblack/node_modules`.

## What the measurement is and isn't

It catches errors of **kind**: pitch falling where it should rise, a "texture"
that's really a smear, two candidates 15dB apart, a sound that measures as a
pure tone when it's supposed to be grinding wood. It has already caught four
such errors in round 1 alone.

It cannot tell us which creak sounds *good*. That is your ear, and your ear
overrules every number in this repo.
