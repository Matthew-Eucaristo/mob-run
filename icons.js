/* MOB RUN icon set: chunky single-color shapes on a 24x24 grid.
   One source for the HTML UI (inline SVG) and the 3D world (Path2D on canvas). */
export const ICONS = {
  flag: 'M4 2h3v20H4z M7 3h13l-3.5 4.5L20 12H7z',
  gun: 'M2 6h18v2h2v5h-6.5l-1.5 2.5h-3L10 22H4.5l2-8.5H2z',
  shield: 'M12 1.5 21 5v6.5c0 5.4-3.8 9.6-9 11-5.2-1.4-9-5.6-9-11V5z',
  magnet: 'M3 3h6v8a3 3 0 0 0 6 0V3h6v8a9 9 0 0 1-18 0z',
  sparkle: 'M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z',
  star: 'M12 1.5l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2L12 18l-6.5 3.4 1.3-7.2L1.5 9.1l7.3-1z',
  bolt: 'M14 0 3 14h7l-2 10 11-15h-7z',
  bullet: 'M8 23V10c0-4.5 2-8 4-9.5 2 1.5 4 5 4 9.5v13z M7 19h10v4H7z',
  arrow: 'M1 9.5h13V4l9 8-9 8v-5.5H1z',
  fan: 'M10.5 23V8l1.5-6 1.5 6v15z M3 20.5 7.6 6.2l4-3.7-1.1 5.4-4.7 14.2z M21 20.5 16.4 6.2l-4-3.7 1.1 5.4 4.7 14.2z',
  heart: 'M12 22 2.8 12.8A5.8 5.8 0 0 1 12 5.3a5.8 5.8 0 0 1 9.2 7.5z',
  bomb: 'M10 23a8 8 0 1 1 0-16 8 8 0 0 1 0 16z M13 6.5l3-3 3.5 3.5-3 3z M18.5 1h2.5v2.5h-2.5z',
  crosshair: 'M12 1.5a10.5 10.5 0 1 1 0 21 10.5 10.5 0 0 1 0-21zm0 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z',
  skull: 'M12 1a10 10 0 0 0-10 10c0 3.3 1.6 5.6 4 7V23h12v-5c2.4-1.4 4-3.7 4-7A10 10 0 0 0 12 1zM8 9.5a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2zm8 0a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2zM10.5 18h3v3h-3z',
  anchor: 'M10.5 1h3v5H17v3h-3.5v10.8A7 7 0 0 0 19 14h-2.5l4-5 3.5 5h-2a10 10 0 0 1-20 0H0l3.5-5 4 5H5a7 7 0 0 0 5.5 5.8V9H7V6h3.5z',
  chevrons: 'M1 3h6l8 9-8 9H1l8-9z M10 3h6l8 9-8 9h-6l8-9z',
  chain: 'M1 13 7 5l5 6 5-7 6 9-3 2-3-4.5-5 7-5-6-3.7 4.5z',
  gift: 'M2 8h20v5H2z M3.5 13h17v10h-17z M10.5 8h3v15h-3z M12 8C9 8 5 6.5 6.5 3.5S11 4 12 8c1-4 4-7 5.5-4.5S15 8 12 8z',
  crown: 'M1 6l6 5 5-8 5 8 6-5-2.5 15h-17z M3.5 21h17v2h-17z',
  wall: 'M1 3h10v6H1z M13 3h10v6H13z M1 10.5h5v6H1z M7.5 10.5h9v6h-9z M18 10.5h5v6h-5z M1 18h10v4H1z M13 18h10v4H13z',
  megaphone: 'M2 9h5l12-7v20L7 15H2z M7 16l2.5 7h4l-2.5-7z',
  bag: 'M8 1h8l-2.5 5h-3z M6 7.5h12c3.5 3.5 5 8 5 10a5 5 0 0 1-5 5H6a5 5 0 0 1-5-5c0-2 1.5-6.5 5-10z',
  plus: 'M8.5 2h7v6.5H22v7h-6.5V22h-7v-6.5H2v-7h6.5z',
  up: 'M12 1l10 10h-6v12H8V11H2z',
  pause: 'M5 3h5v18H5z M14 3h5v18h-5z',
  sound: 'M2 8h5l7-6v20l-7-6H2z M16.5 6.5a8 8 0 0 1 0 11l-2-2a5.2 5.2 0 0 0 0-7z',
  mute: 'M2 8h5l7-6v20l-7-6H2z M16 8.5l2-2 2.5 2.5L23 6.5l2 2-2.5 2.5L25 13.5l-2 2-2.5-2.5-2.5 2.5-2-2 2.5-2.5z',
  share: 'M18 1a4 4 0 1 1-3.4 6.1L9.3 10a4 4 0 0 1 0 3.9l5.3 2.9a4 4 0 1 1-1.4 2.6l-5.4-3a4 4 0 1 1 0-8.9l5.4-3A4 4 0 0 1 18 1z',
  run: 'M14 1a3 3 0 1 1 0 6 3 3 0 0 1 0-6z M9 8l6 1 3 4 4 1-1 3-5-1.5-1.5-1.5-2 4 4 3-1 5-3-.5.5-3-4.5-3L6 23H2.5l3.5-9 1.5-3.5-2 1L4 15H1l2-5z',
  check: 'M9 21 1 13l3.5-3.5L9 14 19.5 3.5 23 7z',
  lock: 'M5 10h14v13H5z M8 10V7a4 4 0 0 1 8 0v3h-3V7a1 1 0 0 0-2 0v3z',
};

/* inline SVG for the DOM; color comes from CSS currentColor */
export function icon(name, cls) {
  const d = ICONS[name] || ICONS.star;
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${d}"/></svg>`;
}

/* draw onto a 2D canvas: outlined in ink, filled in color */
export function drawIcon(g, name, x, y, size, fill, ink) {
  const p = new Path2D(ICONS[name] || ICONS.star);
  g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(size / 24, size / 24);
  g.lineJoin = 'round';
  g.lineWidth = 3.2;
  g.strokeStyle = ink || '#1b1430';
  g.stroke(p);
  g.fillStyle = fill;
  g.fill(p, 'evenodd');
  g.restore();
}
