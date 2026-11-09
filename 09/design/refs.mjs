// 09 / Membrane's look references, made with Codex's image generation (`codex exec`, its built-in image_gen): each
// handed the drum's concept (design/drum-concept.jpg), the shaman's (design/shaman-ceremonial.jpg) and a frame of the
// film as it is (film/refs/now_*.png, from film/09.mp4), and asked for one moment of the piece pushed further — the
// hide at the great stroke, the world inside the drum, the universe's membrane, the hide's down up close, the trip's
// height, a pulse stroke. Written to film/refs/ref_<id>.png to look over; the keepers are copied to design/ as jpg.
//   node 09/design/refs.mjs [ids]        N=3 at once
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

/** codex, its stdin closed (with it open, `codex exec` waits on it for more prompt) */
const run = (args, ms) => new Promise((ok, no) => {
  const c = spawn('codex', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  c.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  c.stdout.resume();
  const t = setTimeout(() => { c.kill(); no(new Error('timed out')); }, ms);
  c.on('close', (code) => { clearTimeout(t); code === 0 ? ok() : no(new Error(`exit ${code}: ${err}`)); });
});
const root = new URL('../../', import.meta.url).pathname;
const work = `${root}film/refs/`;
mkdirSync(work, { recursive: true });
const design = `${root}09/design/`;

const WORLD = 'The piece: a woman shaman in feathered ceremonial regalia stands on a small floating disc of dark stone with glowing inlaid rings, in a violet starry void, before a great frame drum on a stand of living roots (Image 1: its carved shell with abalone inlays, its pale amber hide painted with turquoise and gold sacred geometry, lit from inside). She strikes it with a felt-headed beater. The sky all round is our universe\'s membrane: the inside of a vast soap-film bubble, its faces joined along bright lines, other worlds beyond it.';
const STYLE = 'High-end cinematic CG keyframe, like a frame from a feature film\'s visual-effects sequence: physically lit, deep rich blacks, luminous bloom, volumetric light, fine detail, shallow depth of field where it helps, subtle film grain. Reverent, powerful, never cartoonish or kitsch. Square 1:1, 1024x1024 or larger.';

const SHOTS = {
  veil: 'The final, great stroke, in extreme slow motion, close on the hide: the felt beater head pressed deep into it, slow concentric ripples crawling outward from it across the whole hide and back off the rim, crossing. The hide has thinned to a translucent glowing veil: through it, bent and wavering by the ripples as if seen through water, with faint rainbow fringes at the steepest slopes, is a whole other world inside the drum — an ayahuasca vision realm of luminous intricate geometry receding into infinite depth toward a white-gold source of light. The painted lines on the hide still glow over it. Fine down on the hide catches the light at the ripples.',
  inner: 'The world inside the drum, seen through its veil-thin hide as through a round window: an ayahuasca vision realm. Infinite depth: a kaleidoscopic corridor of living luminous geometry spiralling away to a white-gold source of light at its heart, mandala-symmetric about the drum\'s centre. Its walls are woven of intricate Shipibo kené-like line patterns and sacred geometry, carved filigree like jewelled temple architecture, iridescent serpents winding through it; jewel colours — emerald, magenta, violet, turquoise and gold — glowing from within, a soft haze of light, breathing. The drum\'s carved rim frames it.',
  cosmos: 'Wide: the dais small in the lower third, the shaman standing still before her drum. The whole sky — the universe\'s membrane — ripples after the great stroke: vast slow concentric rings spreading across the soap-film dome from behind the drum, thin-film rainbow colours burning on the crests, bright lines where the bubble\'s faces meet flexing with the waves; in the troughs the film has thinned open onto other worlds beyond — a ringed giant over a glowing sea, a coral of light, a lattice of crystals strung on beams, floating islands in a gold dusk — each in its own face of the foam. The drum\'s hide glows as a translucent portal.',
  hide: 'Macro study of the drum\'s hide: a parchment-thin skin with subsurface scattering, warm amber light glowing through it from inside the drum, its veins darker in the glow; a fine translucent down of hairs over it catching the light along their length, their tips lit through, leaning as a ripple passes under them; the painted turquoise and gold lines glowing softly; one slow ring ripple crossing it, its crest catching a soft sheen. Like fine fibres of light, velvety and alive.',
  peak: 'Seen from behind the shaman: she stands rooted and utterly still, her beater lowered at her side, her feathered headdress a dark silhouette rimmed with light, watching. Before her the great drum\'s hide has become a glowing translucent portal into the vision world inside it — luminous kaleidoscopic geometry in jewel colours spiralling inward to a source of light. All around, filling the sky, the universe\'s membrane ripples in great slow rings, opened on many worlds. Deep silent power.',
  realm: 'REALM_FAR',
  realm_mid: 'REALM_MID',
  realm_near: 'REALM_NEAR',
  pulse: 'One of the opening ceremonial strokes (not the great one): from behind her shoulder, the beater just struck the hide; one clear ring ripple spreads across the hide from the struck point, and where the hide stretches thinnest at its crest, a faint glimpse of glowing geometry shows through it, like a veil lifting for an instant. Far behind the drum, the sky\'s soap-film membrane answers with a faint ring of its own. Her body follows through, knees soft.',
};
/** the film's frame each shot is shown as it is now */
const NOW = { veil: 'now_11.0.png', inner: 'now_11.0.png', cosmos: 'now_16.0.png', hide: 'now_11.0.png', peak: 'now_16.0.png', pulse: 'now_4.8.png' };

// the other realm, seen through the drum's hide when it turns to glass at the great stroke: layers for a window into it
// (09/drum.wgsl parallaxes them inside the drum), a deep painted scene and two of glowing things on black laid over it
// by adding their light — so nothing of the drum, the dais or the sky in them, and the black truly black
const REALM = 'An ayahuasca vision at its height: a wild, living, otherworldly realm, nothing like outer space — no stars, no planets, no galaxies. A jungle-temple of light seen from inside it: colossal serpents of luminous iridescent scales coiling through it, fractal flowers and vines unfolding into more flowers, waterfalls of liquid rainbow light, Shipibo kené line patterns woven through every surface like circuitry of light, many watching eyes in the foliage, a great radiant source at the very centre of the picture pulling the eye deep into it, everything breathing and flowing toward it. Jewel colours: magenta, emerald, ultraviolet, molten gold, turquoise, on deep velvety darkness. Dense, intricate, symmetrical about the vertical axis but organic, never a tiling, never geometric grids, no hexagons.';
// other styles' realms (style.ts): the same three layers each, in another hand — awe, not spectacle: restraint, scale,
// depth, a few colours
const STYLE_REALMS = {
  abyss: 'The deep inner ocean of a vision: an endless dark sea seen from within it, vast and quiet. Colossal translucent beings of light drift far off in it — bell-shaped, veiled, trailing filaments kilometres long, lit from within, slow — and the water between is full of faint drifting light. Awe at immense scale and stillness. A restrained palette: blue-black, deep indigo, bioluminescent cyan and soft violet, one warm gold glow far down at the centre where the light comes from. Photographic, deep-sea, cinematic, subtle, never cartoonish, never neon, never kitsch.',
  cathedral: 'An infinite cathedral of light inside a vision: colossal arches and columns of pure golden light rising out of luminous mist, so vast they dissolve into haze before they end, shafts of light falling through it, motes of light suspended in the air, a blinding white-gold radiance at the centre far away. Reverent, silent, sublime. A restrained palette: warm gold, amber, ivory, soft rose shadows, deep umber dark. Painterly-photographic, atmospheric, like light in fog, never gaudy, never kitsch, no figures.',
  nocturne: 'A vision of the night jungle: a colossal serpent made of starlight coils slowly through a black rainforest, its body a river of tiny stars and faint luminous lines, vast, its head far off and calm, one eye a soft gold light; around it ferns and vines and leaves only just glowing at their edges, mist low between the trunks, deep velvet darkness everywhere. Awe, stillness, the sacred and the immense, nothing cute. A restrained palette: black, deep green, starlight white-blue, one warm gold. Photographic night, long exposure, never neon, never kitsch, no geometric grids, no hexagons.',
  dawn: 'The first light inside a vision: an endless sea of luminous cloud seen from high above it, layer beyond layer to a vast horizon, and at the centre a sun of white-gold light rising out of it, so bright it blooms, its beams fanning out through the cloud; the clouds lit gold and rose on their tops, pearl and lavender in their depths. Sublime, silent, enormous, the feeling of being shown the beginning of everything. Restrained palette: white-gold, pearl, rose, soft lavender, deep blue shadow. Photographic, atmospheric, never kitsch, no figures, no birds, no text.',
  lumen: 'The innermost space of a vision: an endless velvet darkness in which a colossal flower of light is slowly unfolding — translucent petals of ivory light, layer within layer, fractal, each petal veined with finer light, unfolding toward the viewer from a blinding white core far away, the petals so vast they fade into the dark at their edges; dust of light drifting. Sublime, silent, sacred, awe at immense scale. Nearly monochrome: ivory, pearl, soft warm white on black, the faintest iridescence at the petals\' edges. Photographic, like light sculpture in fog, never neon, never kitsch, never a mandala, no geometric symmetry grids.',
  mycelium: 'The inner forest of a vision: a dark living forest made of light — luminous mycelial threads and roots branching endlessly through soft darkness, fractal like veins and rivers seen from above, spores of light drifting up, and at the centre a slow-breathing heart of warm light that all the threads run toward. Intimate and immense at once, alive, organic, quiet. A restrained palette: deep moss green and black, pale gold, amber, a little violet. Photographic macro feeling, soft depth of field, never neon, never kitsch, no faces, no geometric grids, no hexagons.',
};
for (const [k, scene] of Object.entries(STYLE_REALMS)) {
  SHOTS[`${k}_far`] = SHOTS[`${k}_mid`] = SHOTS[`${k}_near`] = k;
}
const LAYERS = {
  ...Object.fromEntries(Object.entries(STYLE_REALMS).flatMap(([k, scene]) => [
    [`${k}_far`, `${scene} This is the far, deep layer: fill the whole square edge to edge with the scene (no frame, no border, no vignette to black at the edges), its source of light exactly at the centre.`],
    [`${k}_mid`, `${scene} This is a MIDDLE LAYER for compositing: only the largest forms of the scene (the beings, the arches, the great threads), glowing, spread round the picture with the centre left mostly empty, on a PURE BLACK background (#000000, completely black everywhere there is nothing) — it will be added over a deeper picture by its light, so no haze, no gradient in the black.`],
    [`${k}_near`, `${scene} This is the NEAREST LAYER for compositing: only fine glowing things floating close to the viewer (motes, spores, filaments, drifting specks of light), sparse, scattered round the edges more than the centre, on a PURE BLACK background (#000000, completely black everywhere there is nothing), soft and slightly out of focus — it will be added over deeper pictures by its light, so no haze, no gradient in the black.`],
  ])),
  realm: `${REALM} This is the far, deep layer: fill the whole square edge to edge with the scene (no frame, no border, no vignette to black at the edges), the radiant source exactly at the centre.`,
  realm_mid: `${REALM} This is a MIDDLE LAYER for compositing: only the serpents and the great unfolding fractal flowers and vines, glowing, spread round the picture with the centre left empty, on a PURE BLACK background (#000000, completely black everywhere there is nothing) — it will be added over a deeper picture by its light, so no haze, no fog, no gradient in the black.`,
  realm_near: `${REALM} This is the NEAREST LAYER for compositing: only fine glowing things floating close to the viewer — threads and tendrils of light, spores, sparks, tiny luminous seeds and petals, sparse, scattered round the edges more than the centre, on a PURE BLACK background (#000000, completely black everywhere there is nothing) — it will be added over deeper pictures by its light, so no haze, no gradient in the black.`,
};

async function make(id) {
  const out = `${work}ref_${id}.png`;
  if (LAYERS[id]) {
    const p = ['Use case: a texture layer for a real-time WebGPU piece (painted, luminous, extremely detailed).', LAYERS[id],
      'Square 1:1, 1024x1024 or larger. No text, no logos, no watermark, no drum, no person, no frame. Output the image only, fully opaque.'].join('\n\n');
    writeFileSync(`${work}${id}_prompt.txt`, p);
    const task = `Use your built-in image generation (the imagegen skill, built-in image_gen tool) to make this one image, then copy the generated PNG to exactly ${out} (overwrite it). Do nothing else.\n\n${p}`;
    const t0 = Date.now();
    try {
      await run(['exec', task, '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', work], 15 * 60 * 1000);
      console.log(id, existsSync(out) ? `made in ${Math.round((Date.now() - t0) / 1000)} s` : 'NO OUTPUT');
    } catch (e) { console.log(id, 'failed:', String(e.message).slice(0, 300)); }
    return;
  }
  const imgs = [`${design}drum-concept.jpg`, `${design}shaman-ceremonial.jpg`, `${work}${NOW[id]}`];
  const p = [
    'Use case: concept art / look development reference for a real-time WebGPU piece.',
    'INPUT: Image 1 is the drum\'s design, Image 2 the shaman\'s, Image 3 a frame of the piece as it renders now (keep its world, its colours and its designs, but push the look much further).',
    `WORLD: ${WORLD}`,
    `SHOT: ${SHOTS[id]}`,
    `STYLE: ${STYLE}`,
    'No text, no logos, no watermark. Output the image only, fully opaque.',
  ].join('\n\n');
  writeFileSync(`${work}${id}_prompt.txt`, p);
  const task = `Use your built-in image generation (the imagegen skill, built-in image_gen tool) to make this one image from the attached images, then copy the generated PNG to exactly ${out} (overwrite it). Do nothing else.\n\n${p}`;
  const args = ['exec', task, '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', work];
  for (const f of imgs) args.push('-i', f);
  const t0 = Date.now();
  try {
    await run(args, 15 * 60 * 1000);
    console.log(id, existsSync(out) ? `made in ${Math.round((Date.now() - t0) / 1000)} s` : 'NO OUTPUT');
  } catch (e) {
    console.log(id, 'failed:', String(e.message).slice(0, 300));
  }
}

const q = (process.argv[2] ?? Object.keys(SHOTS).join(',')).split(',');
const N = Number(process.env.N ?? 3);
await Promise.all(Array.from({ length: N }, async () => { while (q.length) await make(q.shift()); }));
