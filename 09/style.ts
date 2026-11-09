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
  /** the grade: saturation, exposure, bloom, the hue's drift (×), how cool the depths go under water */
  grade: { sat: number; exp: number; bloom: number; drift: number; cool: number };
  /** the sky: how far its tears open on the worlds at most (0..1), and how far the trip heaves it (×) */
  sky: { reveal: number; heave: number };
  /** the struck hide's glass: how clear it gets (0..1) */
  glass: number;
}

const STYLES: Record<string, Style> = {
  a: { id: 'a', after: 9.1, realm: 'assets', realmMix: [0.6, 1.0, 0.8], realmFly: 0.022, realmTwist: 1,
    grade: { sat: 1, exp: 1, bloom: 1, drift: 1, cool: 1 }, sky: { reveal: 1, heave: 1 }, glass: 0.97 },
  // the deep: a dark sea inside the drum, vast slow beings of light; the longest, quietest moment; the sky barely torn
  abyss: { id: 'abyss', after: 13, realm: 'design/realms/abyss', realmMix: [0.9, 1.1, 0.7], realmFly: 0.012, realmTwist: 0.4,
    grade: { sat: 0.82, exp: 0.95, bloom: 1.15, drift: 0.4, cool: 1.6 }, sky: { reveal: 0.55, heave: 0.7 }, glass: 0.98 },
  // a cathedral of gold light in mist: warm, bright, reverent; the sky opening wide
  cathedral: { id: 'cathedral', after: 10, realm: 'design/realms/cathedral', realmMix: [0.85, 0.9, 0.7], realmFly: 0.018, realmTwist: 0.5,
    grade: { sat: 0.9, exp: 1.05, bloom: 1.3, drift: 0.3, cool: 0.4 }, sky: { reveal: 1, heave: 0.8 }, glass: 0.96 },
  // an inner forest of light: the slowest, longest breath after the stroke
  mycelium: { id: 'mycelium', after: 16, realm: 'design/realms/mycelium', realmMix: [0.85, 1.0, 0.8], realmFly: 0.014, realmTwist: 0.6,
    grade: { sat: 0.88, exp: 0.98, bloom: 1.1, drift: 0.5, cool: 0.9 }, sky: { reveal: 0.8, heave: 1.1 }, glass: 0.97 },
};

const fromPage = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('style') : null;
const fromEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.STYLE;
export const STYLE: Style = STYLES[fromPage ?? fromEnv ?? 'a'] ?? STYLES.a;
