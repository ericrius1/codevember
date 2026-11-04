// 04 / Gyre: forty nested hoops turning over in a cascade. Each hoop flips half a turn about its diameter twice a
// loop (a half turn brings a hoop back onto itself, so the loop closes), the outer ones first; the whole sculpture yaws
// once a loop. All of it is the CPU's choreography handed to one fullscreen sphere-tracing pass (gyre.wgsl).
import { day } from '../src/days';
import { sketch } from '../src/sketch';
import gyre from './gyre.wgsl';

const N = 40;
const TAU = Math.PI * 2;
// ease in and out, flat at both ends (so a hoop leaves and lands without a jolt)
const ease = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
const fract = (x: number) => x - Math.floor(x);

sketch(day(4), ({ kit, orbit, fit }) => {
  const look = kit.uniforms(gyre.structs.Gyre).set({
    outer: 1.0, inner: 0.17, width: 0.0062, height: 0.052, floorY: -1.1, exposure: 1.0,
  });
  kit.overlay.tweak(look, 'gyre');
  const rings = new Float32Array(N * 4);
  const out = kit.pass({ label: 'gyre', color: [{ target: 'screen', clear: [0, 0, 0, 1] }] });
  out.fullscreen(gyre, { bind: { gyre: look } });

  const cam = kit.camera;
  return ({ u, frame }) => {
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1);
      // two flips a loop; the cascade runs outside → in over 70% of a flip, so most of the time some are mid-turn
      const flip = ease(fract(2 * u - x * 0.85));
      const tilt = Math.PI * flip;
      const yaw = TAU * u + x * 1.1;
      rings.set([Math.cos(yaw), Math.sin(yaw), Math.cos(tilt), Math.sin(tilt)], i * 4);
    }
    look.set({ rings, seed: frame % 64 });
    const az = 0.55 + orbit.yaw, el = 0.36 + orbit.pitch, d = 5.0;
    // (looking a little right of the middle, toward where the shadow falls, so the two sit balanced in the square)
    const rx = Math.cos(az) * 0.12, rz = -Math.sin(az) * 0.12;
    cam.lookAt([Math.sin(az) * Math.cos(el) * d + rx, Math.sin(el) * d - 0.25, Math.cos(az) * Math.cos(el) * d + rz], [rx, -0.3, rz]);
    fit(cam, 34);
    return [out];
  };
});
