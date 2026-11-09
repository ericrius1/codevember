// The day's pictures and sound, as Vite asset URLs: the realm in the glass (a garden without end, its painted mosaic:
// design/realms/garden) and the soundtrack (made by audio/render.ts).
import realmFar from './design/realms/garden/mosaic.webp?url';
import realmMid from './design/realms/garden/mosaic.webp?url';
import realmNear from './design/realms/garden/mosaic.webp?url';
import sound from './assets/membrane.m4a?url';

/** the realm's three layers, deep to near */
export const realmUrls = (): string[] => [realmFar, realmMid, realmNear];
/** the soundtrack, one loop long */
export const soundtrack = (): string => sound;
