# rig — Boulder's character runtime, lifted

Boulder's hero rig (`web/src/hero`, `cast`, `body`, `town/hands.ts`, from boulder@352e051e), so a Codevember day can
load a person built by Boulder's town pipeline (a DNC1 file: see 09/character) and pose them: the HeroRig's arm fit,
finger IK, verlet chains (hair, skirt panels), face, and the whole-body solver (body/solve.ts, injected as
`HeroRig.bodyKit`). The files are Boulder's as they were, with only the asset fetch made plain `fetch`; changes made
here that are worth having there go back to Boulder (and its copies in sevenhavens and waterbending).

What's new here, beside them: `strike.ts` — a stroke planner for anything swung at a surface (a drum's beater, a gong's
mallet, a hammer, an axe): the implement's path from the backswing through contact to the rebound, the kinetic chain
(hips, trunk, shoulder, elbow, wrist, each a beat after the last) and the body goal that carries it.
