// Every day's name, for its page and the gallery. A day's sketch is <dd>/main.ts.
export interface Day {
  day: number;
  title: string;
  /** seconds per loop */
  loop: number;
  colors: { bg: string; fg: string; accent?: string };
  /** its film's id on the footage page (public/footage/footage.json), if not the day's own number */
  filmId?: string;
}

export const DAYS: Day[] = [
  { day: 4, title: 'Gyre', loop: 16, colors: { bg: '#e6e0d7', fg: '#2b2520' } },
  { day: 9, title: 'Membrane', loop: 22, colors: { bg: '#0b0714', fg: '#efe3cf', accent: '#5fe3d0' }, filmId: '09-infinite' },
];

export const day = (n: number) => {
  const d = DAYS.find((x) => x.day === n);
  if (!d) throw new Error(`day ${n} isn't in src/days.ts`);
  return d;
};
