# CREAK — findings log

Running record of what worked, what didn't, and why. Verdicts are the user's
ear; measurements are `test/measure.js`.

---

## Working theory going in

A creak is a **relaxation oscillator**. Two dry surfaces under load stick,
elastic energy builds, the joint releases in a snap, repeat. Three consequences
I built round 1 around:

1. **The release rate is the pitch you hear.** Not an oscillator frequency — the
   rate at which the joint lets go.
2. **The body is a fixed resonance the source is heard through.** The wood or
   metal colours every release identically regardless of the rate. A moving
   source through a stationary body is the whole trick; move both together and
   you get a synth sweep.
3. **A creak is something being moved.** It needs weight arriving, effort in the
   middle (it surges — it is not steady), and a release at the end.

---

## Round 1 — three mechanisms, three registers

| id | name | mechanism |
|----|------|-----------|
| r1a | FLOORBOARD | stick-slip pulse train, 175→340 slips/sec, dry wood formants (380/1250/2700Hz) |
| r1b | DOOR GROAN | same relaxation oscillator at 54→98/sec, heavy low body (118/255/690Hz), 1.0s |
| r1c | RUSTY HINGE | no pulse train: noise through a swept high-Q resonator with a random-walk waver, 1300→2060Hz, 0.42s |

Measured (median of 7 renders):

```
id    peak    dur    centroid  cent s>e   flat  onsets ioiCV  f0 early>late>tail
r1a   -8.5dB  0.55s  3781Hz    4152>2425  0.28    2    0.71   218 > 337 > 72
r1b   -8.6dB  1.02s  456Hz     485>409    0.02   17    0.49    64 >  96 >  -
r1c   -8.9dB  0.42s  3272Hz    3053>3288  0.19    3    0.56  1575 > 2005 > 1378
```

**Verdict: pending user listen.**

### Things the lab caught before the user heard anything

- **The f0 estimator was lying.** Global-max normalized autocorrelation returns
  the *minimum lag* for anything low-pitched, because correlation is ≈1 for tiny
  lags on any smooth signal. Every candidate read as 2756Hz (= SR/minLag). Fix:
  skip past the first zero crossing before peak-picking. This same flaw is
  latent in `Lampblack/test/audio-lab.js` — it only escaped notice there because
  those recipes sit at 600-1200Hz.
- **One render is not a measurement.** These recipes are stochastic by design;
  peaks swing up to 3dB between renders. The first level-match pass was chasing
  dice. Now: median of N renders.
- **A drop crammed into the last 6% of a sound doesn't exist.** r1c's ending
  smear measured as *no* pitch fall at all: the envelope had already decayed, so
  the drop happened under the noise floor while the resonator rang on at the old
  pitch. Fix: give the fall a fifth of the duration and hold level through it.
  (Same failure mode as the original Lampblack `stickSlip` end-drop.)
- **A "wooden groan" with zero noise measures like a synth bass.** r1b came out
  at spectral flatness 0.00 — a pure tone. Wood grinding on wood always has
  broadband content; added a quiet 480Hz friction bed (flatness → 0.02,
  centroid 456Hz, still unmistakably low).

### Open questions for round 2 (depends on the verdict)

- Is a creak's identity in the **rate** (pulse train) or in the **resonance**?
- Does the grit want to be *per-cycle irregularity* (r1a/r1b) or *pitch
  instability* (r1c)?
- How much surge is right? All three swell 3-4 times; is that effort or wobble?
