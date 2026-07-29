# reference/ — drop real recordings here

Put creak audio files in this folder and I'll analyze them:

```
node test/reference.js              # everything in this folder
node test/reference.js --split      # if a file holds several creaks
node test/reference.js --compare    # also profile my synth candidates the same way
```

Any format (`wav` `mp3` `flac` `ogg` `m4a`), any sample rate, mono or stereo.
Level doesn't matter — everything is normalized before analysis.

## What I get out of a recording

- **The slip-rate contour** — how fast a real joint actually releases, and
  whether the rate climbs linearly, geometrically, or in jumps. I have been
  guessing this from first principles.
- **The body resonances** — printed directly as a `WOOD` table I can paste into
  `js/creaks.js`. This works because in a stick-slip sound the source rate
  sweeps while the resonances stay put, so the long-term average spectrum smears
  the harmonics away and leaves the material standing.
- **Swell count, duration, brightness, tonal-vs-noisy, onset irregularity** —
  all the numbers I have been setting by taste.

## What makes a recording useful

Roughly in order of how much it helps:

1. **Isolated.** One creak, nothing else in the room. Music, speech or traffic
   underneath will show up as resonances that aren't the door's.
2. **Dry.** Close-miced beats a big reverberant hallway; reverb smears the end
   drop and adds room modes to the resonance readout.
3. **Whole gesture.** Include the moment weight arrives and the moment it
   stops. The start and the end are where I keep getting it wrong.
4. **Variety beats quality.** Three mediocre recordings of *different* things —
   a door, a floorboard, a chair, a rope, a hinge — teach far more than one
   pristine recording of a single door.

Phone recordings are completely fine. So are clips pulled from freesound or a
sound library; name the file after what it is (`old-door-slow.wav`,
`floorboard-step.mp3`) and that name shows up in the report.

Keep them short — a couple of seconds each. If a file has several creaks in it,
use `--split` and each one gets profiled separately.
