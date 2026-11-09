// 09 / Membrane's styles: the same act in other hands, for films side by side on the footage page. ?style=<id> on the
// page (tools/render.mjs --q 'style=<id>'), STYLE=<id> for the soundtrack (09/audio/render.ts) and the motion's tools.
// 'a' is the piece as it stands live; the others differ in how long the great stroke's moment lasts, the realm the
// hide turns to glass on (its three painted layers: 09/design/refs.mjs <id>_far,<id>_mid,<id>_near), and the grade.
export interface Style {
  id: string;
  /** seconds from the great stroke to the fade */
  after: number;
  /** the realm's layers: a folder (relative to 09/) holding realm-{far,mid,near}.webp */
  realm: string;
  /** the realm's layers' gains (deep, middle, near), and its deep layer's flight (octaves a second) and twist */
  realmMix: [number, number, number]; realmFly: number; realmTwist: number;
  /** the grade: saturation (from the great stroke on), exposure, bloom, the hue's drift (×), how cool the depths go under
   *  water */
  grade: { sat: number; exp: number; bloom: number; drift: number; cool: number };
  /** the sky: how far its tears open on the worlds at most (0..1), how far the trip heaves it (×), its hue turned
   *  (rad), and which worlds its tears open on (cosmos.wgsl's kinds: 0 giant, 1 coral, 2 lattice, 3 islands, 4 galaxy,
   *  5 aurora, 6 nebula; empty: all) */
  sky: { reveal: number; heave: number; hue: number; kinds: number[] };
  /** the struck hide's glass: how clear it gets (0..1) */
  glass: number;
  /** the realm's light spilling out through the glass onto her and the dais: its colour, and how strong (× the trip) */
  light: [number, number, number]; spill: number;
  /** the light pouring out of the glass toward us (post.wgsl's rays): how strong (× the trip) */
  rays: number;
}

const STYLES: Record<string, Style> = {
  a: { id: 'a', after: 9.1, realm: 'assets', realmMix: [0.6, 1.0, 0.8], realmFly: 0.022, realmTwist: 1,
    grade: { sat: 1, exp: 1, bloom: 1, drift: 1, cool: 1 }, sky: { reveal: 1, heave: 1, hue: 0, kinds: [] }, glass: 0.97, light: [1.0, 0.55, 0.22], spill: 0.5, rays: 0 },
  // the serpent realm of 'a' with everything since: its light spilling on her, pouring out as rays, a longer moment,
  // the sky heaving harder
  vision: { id: 'vision', after: 11, realm: 'assets', realmMix: [0.6, 1.0, 0.9], realmFly: 0.02, realmTwist: 0.8,
    grade: { sat: 1, exp: 1, bloom: 1.1, drift: 1, cool: 1.2 }, sky: { reveal: 1, heave: 1.3, hue: 0, kinds: [] }, glass: 0.97, light: [1.0, 0.55, 0.7], spill: 1.6, rays: 1.0 },
  // the deep: a dark sea inside the drum, vast slow beings of light; the longest, quietest moment; the sky barely torn
  abyss: { id: 'abyss', after: 13, realm: 'design/realms/abyss', realmMix: [0.9, 1.1, 1.4], realmFly: 0.012, realmTwist: 0.4,
    grade: { sat: 0.82, exp: 0.95, bloom: 1.15, drift: 0.4, cool: 1.6 }, sky: { reveal: 0.55, heave: 0.7, hue: -0.3, kinds: [4, 6, 5] }, glass: 0.98, light: [0.35, 0.75, 1.0], spill: 1.4, rays: 0.6 },
  // a cathedral of gold light in mist: warm, bright, reverent; the sky opening wide
  cathedral: { id: 'cathedral', after: 10, realm: 'design/realms/cathedral', realmMix: [0.42, 0.6, 1.3], realmFly: 0.018, realmTwist: 0.5,
    grade: { sat: 0.9, exp: 1.0, bloom: 1.15, drift: 0.3, cool: 0.4 }, sky: { reveal: 0.85, heave: 0.8, hue: 1.9, kinds: [3, 0, 2] }, glass: 0.96, light: [1.0, 0.72, 0.38], spill: 2.2, rays: 1.2 },
  // a flower of light unfolding in the dark: nearly monochrome after the stroke, the sky barely torn, white light
  lumen: { id: 'lumen', after: 12, realm: 'design/realms/lumen', realmMix: [1.05, 1.2, 1.5], realmFly: 0.016, realmTwist: 0.5,
    grade: { sat: 0.4, exp: 1.0, bloom: 1.35, drift: 0.2, cool: 0.5 }, sky: { reveal: 0.4, heave: 0.9, hue: 0, kinds: [4, 6, 5] }, glass: 0.97, light: [1.0, 0.93, 0.82], spill: 2.0, rays: 1.8 },
  // an inner forest of light: the slowest, longest breath after the stroke
  mycelium: { id: 'mycelium', after: 16, realm: 'design/realms/mycelium', realmMix: [0.85, 1.0, 1.4], realmFly: 0.014, realmTwist: 0.6,
    grade: { sat: 0.88, exp: 0.98, bloom: 1.1, drift: 0.5, cool: 0.9 }, sky: { reveal: 0.8, heave: 1.1, hue: -1.4, kinds: [1, 5, 6] }, glass: 0.97, light: [1.0, 0.62, 0.28], spill: 1.6, rays: 0.9 },
};

const fromPage = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('style') : null;
const fromEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.STYLE;
export const STYLE: Style = STYLES[fromPage ?? fromEnv ?? 'a'] ?? STYLES.a;
