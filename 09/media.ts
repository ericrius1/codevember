// The day's pictures and sound, as Vite asset URLs: the realm in the glass (an ocean's way down, its three painted
// layers: design/realms/ocean) and the soundtrack (made by audio/render.ts).
import realmFar from './design/realms/ocean/realm-far.webp?url';
import realmMid from './design/realms/ocean/realm-mid.webp?url';
import realmNear from './design/realms/ocean/realm-near.webp?url';
import sound from './assets/membrane.m4a?url';

/** the realm's three layers, deep to near */
export const realmUrls = (): string[] => [realmFar, realmMid, realmNear];
/** the soundtrack, one loop long */
export const soundtrack = (): string => sound;
