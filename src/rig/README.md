# rig — Boulder's character runtime, lifted

Boulder's hero rig (`web/src/hero`, `cast`, `body`, `town/hands.ts`, from boulder@352e051e), so a Codevember day can
load a person built by Boulder's town pipeline (a DNC1 file: see 09/character) and pose them: the HeroRig's arm fit,
finger IK, verlet chains (hair, skirt panels), face, and the whole-body solver (body/solve.ts, injected as
`HeroRig.bodyKit`). The files are Boulder's as they were, with only the asset fetch made plain `fetch`; changes made
here that are worth having there go back to Boulder (and its copies in sevenhavens and waterbending).

What's new here, beside them (all back in Boulder's `web/src/hero` too):

- `strike.ts` — a stroke planner for anything swung at a surface (a drum's beater, a gong's mallet, a hammer, an axe):
  the implement's path from the rise through the top, a whip of a downswing (the hand still accelerating into contact,
  the shaft laid back early then turning as s^p, from rest at the top), contact, a rebound at the head's real speed
  (never back into the surface), the hand's follow-through, and the kinetic chain's phases. The hand's whole path is
  quintic Hermite segments, continuous to its acceleration everywhere but the contact; a sequence (`Strokes`) flows
  each rebound on up into the next rise through the ready pose. `gripGoal` holds the shaft in a hammer grip, its
  forearm leaning on the swing plane so it never flips when the shaft passes in line with the arm.
- `strands.ts` — chains on points the rig carries (locks, bead strings, cords, a sash's tails): the roots swept through
  each frame, fixed substeps, the bend a spring given in Hz, drag toward the air's own velocity, follow-the-leader for
  the length with its velocity correction, and the constraints' velocity capped so a tiny step (a dilated clock, a jump)
  can never fling them.
- `track.ts` — quintic Hermite keys (velocity given, held, or found from the neighbours; monotone if asked): a body's
  channels laid out as tracks, so nothing in it ever jumps or stops dead.
- `hero/rig.ts`'s arm fit can follow its own minimum frame on frame (`HeroRig.armContinuity`, off by default: an elbow
  swings only so fast round the shoulder–wrist line, and hurries over to a much better way round rather than flipping
  there in a frame). Day 09 turns it on.

Measuring motion: `node 09/lab/run.mjs [--onion]` runs a day's performance on the CPU on the film's clock and reports
every joint's, the beater's and the strands' velocity, acceleration and jerk, the one-frame spikes ranked with where in
the stroke they fall, and draws charts and onion skins (film/lab/).
