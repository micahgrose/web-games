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

**Verdict: B closest.** A had "a whoosh in the background" and "didn't sound like
a natural material". C "was actually close to a scream".

### What round 1 taught

1. **A creak lives LOW.** The 54-98 slips/sec groan beat both the 175-340/sec
   mid pulse train and the 1300-2000Hz squeal. The identity is the material
   complaining, not the joint squeaking. My instinct — that a creak is a
   mid/high squeak — was wrong.
2. **An independent noise layer detaches and becomes its own object.** A's
   3100Hz friction bed surged on the same envelope as the slips and still read
   as a separate *whoosh* rather than as friction on the wood. Sharing an
   envelope is not enough to bind two layers into one object; they have to share
   the same *events*. → round 2 removes free-running noise entirely and gets
   brightness from resonances excited by the slips themselves.
3. **A mid-register pulse train reads as synthetic.** "Didn't sound like a
   natural material" — 175-340 releases/sec through evenly spaced formants sits
   in buzzer territory.
4. **A sustained high tone with a waver is a VOICE, not a mechanism.** No matter
   that C's waver was a random walk and its source was noise in a resonator —
   pitched + high + sustained + unstable = scream. There may be no way to make
   something in that register read as a hinge.

---

## Harvest — accidents worth keeping

Failed creaks that are the right starting point for a different sound. Both are
in `js/creaks.js` and still playable from the page.

- **`r1c` → SCREAM.** Noise through a high-Q resonator swept 1300→2060Hz with a
  random-walk waver, plus a thin triangle core. Read as a scream unprompted.
  Start here for scream/shriek work; the random walk is what makes it sound
  distressed instead of musical.
- **`r1a`'s noise bed → DRAG.** The very thing that ruined it as a creak — a
  wide 3100Hz bandpass noise layer surging 3 times across ~0.5s, floating free
  of the tonal content — is close to a body-drag / sack-drag. The detachment is
  the feature there: a drag *is* broadband surface noise with no pitched source.

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

---

## Round 2 — built on B. Low register, and NO free-running noise anywhere

Every candidate uses the winning 54→98 slips/sec contour and the same five-mode
wooden body, so the round varies exactly one thing each.

| id | name | the question it asks |
|----|------|----------------------|
| r2a | BOUND BRIGHTNESS | does "material" come from resonance rather than hiss? Round 1's winner with its 1.9kHz lid removed and five inharmonic modes to 2.4kHz, all rung by the slips themselves |
| r2b | UNSTABLE REGIME | is a creak's identity in *instability*? The joint jumps between release regimes (rate halving/doubling) instead of gliding up |
| r2c | MULTI-CONTACT | does thickness come from *several* contacts? Three generators at inharmonic rates, each surging on its own schedule, through one shared body |

```
id    peak    dur    centroid  cent s>e   flat  onsets ioiCV  f0 early>late>tail
r2a   -8.2dB  1.02s  416Hz     418>376    0.01   16    0.58    65 >  91 >  -
r2b   -8.1dB  1.02s  424Hz     420>368    0.01   19    0.55    65 >  92 >  -
r2c   -8.1dB  1.02s  424Hz     453>359    0.01   17    0.48    83 > 113 > 61
```

**Verdict: pending user listen.**

### RELEASE TIME IS THE BRIGHTNESS CONTROL — the round's real discovery

R2-A was supposed to be a brighter version of the round-1 winner. The lab
measured it **darker**: centroid 233Hz against 453Hz, despite added modes up to
2.4kHz and the lowpass removed.

Cause: a 1.6ms release rolls the excitation off above ≈1/(2·1.6ms) ≈ 300Hz, so
the high wooden modes were being handed nothing to ring with. Shortening the
release to 0.4ms — physically, a drier and stiffer joint — brought the centroid
to 416Hz *with spectral flatness 0.01*, i.e. brightness coming from resonance
rather than from noise. Round 1's B measured 469Hz at flatness 0.03, and that
extra was all noise bed.

So the honest knobs for a stick-slip sound turn out to be:

- **slip rate** → pitch
- **release sharpness** → brightness / how dry and hard the material is
- **per-cycle jitter** → grit
- **body modes** → what the thing is made of
- **envelope surges** → effort

None of which is "add noise until it sounds rough".

### Also caught

- Autocorrelation f0 is meaningless on a multi-source candidate — it locks onto
  whichever generator dominates a window. r2c is flagged `poly` and skips those
  checks rather than reporting a number that doesn't mean anything.
