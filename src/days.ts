// Every day's words, for its page and the gallery. A day's sketch is <dd>/main.ts.
export interface Day {
  day: number;
  title: string;
  /** a sentence about it */
  note: string;
  /** seconds per loop */
  loop: number;
  colors: { bg: string; fg: string; accent?: string };
}

export const DAYS: Day[] = [
  { day: 4, title: 'Gyre', loop: 16, note: 'Forty glazed hoops, each turning over twice a loop, the outside first.', colors: { bg: '#e6e0d7', fg: '#2b2520' } },
];

export const day = (n: number) => {
  const d = DAYS.find((x) => x.day === n);
  if (!d) throw new Error(`day ${n} isn't in src/days.ts`);
  return d;
};
