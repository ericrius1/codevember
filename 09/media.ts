// Explicit Vite asset discovery includes every filmed realm and soundtrack in production.
// Only the selected style's URLs are fetched by the scene.
import { STYLE } from './style';

const realms = import.meta.glob<string>(['./assets/realm-*.webp', './design/realms/*/realm-*.webp'], {
  eager: true, query: '?url', import: 'default',
});
const audio = import.meta.glob<string>('./assets/membrane*.m4a', { eager: true, query: '?url', import: 'default' });
const beyond = import.meta.glob<string>('./design/beyond/beyond-*.webp', { eager: true, query: '?url', import: 'default' });

/** the dimension beyond our universe's membrane (cosmos.wgsl): its three wide layers, far to near, if the style has it */
export function beyondUrls(): string[] | null {
  if (!STYLE.beyond) return null;
  return ['far', 'mid', 'near'].map((layer) => beyond[`./${STYLE.beyond}/beyond-${layer}.webp`]);
}

export function realmUrls(): string[] {
  return ['far', 'mid', 'near'].map((layer) => {
    const path = `./${STYLE.realm}/realm-${layer}.webp`;
    if (!realms[path]) throw new Error(`Missing realm: ${path}`);
    return realms[path];
  });
}
export function styleAudio(): string {
  const path = `./assets/membrane${STYLE.id === 'a' ? '' : `-${STYLE.id}`}.m4a`;
  if (!audio[path]) throw new Error(`Missing soundtrack: ${path}`);
  return audio[path];
}
