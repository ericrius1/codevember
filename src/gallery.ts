// The gallery: every day so far, newest first, each tile its film looping (played only while it's on screen), a
// way into the live sketch and to the film's own page.
import { DAYS } from './days';
import './gallery.css';

interface Film { id: string; video: string; poster: string; small?: string | null }
const pad = (n: number) => String(n).padStart(2, '0');
const main = document.getElementById('days')!;

const films: Film[] = await fetch(`${import.meta.env.BASE_URL}footage/footage.json`).then((r) => r.json()).catch(() => []);
const seen = new IntersectionObserver((es) => {
  for (const e of es) {
    const v = e.target as HTMLVideoElement;
    if (e.isIntersecting) { if (!v.src && v.dataset.src) v.src = v.dataset.src; v.play().catch(() => {}); } else v.pause();
  }
}, { rootMargin: '200px' });

for (const d of [...DAYS].sort((a, b) => b.day - a.day)) {
  const film = films.find((f) => f.id === (d.filmId ?? pad(d.day)));
  const a = document.createElement('article');
  a.style.setProperty('--tile', d.colors.bg);
  a.innerHTML = `
    <a class="tile" href="${pad(d.day)}/" aria-label="${d.title}, live">
      ${film ? `<video muted loop playsinline preload="none" poster="${film.poster}" data-src="${film.small ?? film.video}"></video>` : `<span class="soon">live only for now</span>`}
    </a>
    <div class="cap">
      <h2><span class="n">${pad(d.day)}</span> ${d.title}</h2>
      <p>${d.note}</p>
      <div class="links"><a href="${pad(d.day)}/">Live</a>${film ? `<a href="footage/?film=${film.id}">Film</a>` : ''}</div>
    </div>`;
  main.append(a);
  const v = a.querySelector('video');
  if (v) seen.observe(v);
}
