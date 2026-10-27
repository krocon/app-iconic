#!/usr/bin/env node
// A large SVG for performance tests (prompt 031): groups of transformed paths, circles and rects,
// deterministic (seeded). Default ≥ 20 000 nodes and ≥ 5 MB; every third shape (the rects) has its
// own opacity unless `--plain` – each of those is a compositing layer in Chromium.
//
//   node scripts/big-svg.mjs [nodes] [--plain] > big.svg
import { fileURLToPath } from 'node:url';

/** A small deterministic random generator (mulberry32). */
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Number(n.toFixed(2));

/** The SVG text with at least `nodes` shapes (in groups of 50, each group transformed). */
export function bigSvg(nodes = 20_000, seed = 31, { opacity = true } = {}) {
  const rnd = random(seed);
  const parts = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">',
  ];
  let made = 0;
  let g = 0;
  while (made < nodes) {
    const tx = f(rnd() * 200 - 100);
    const ty = f(rnd() * 200 - 100);
    parts.push(
      `<g id="g${g}" transform="translate(${tx} ${ty}) rotate(${f(rnd() * 360)} 512 512)">`,
    );
    for (let i = 0; i < 50 && made < nodes; i++, made++) {
      const x = f(rnd() * 1024);
      const y = f(rnd() * 1024);
      const k = made % 3;
      const color = `#${Math.floor(rnd() * 0xffffff)
        .toString(16)
        .padStart(6, '0')}`;
      if (k === 0) {
        // a path of 24 cubic segments (~ 300 bytes) – most of the size
        let d = `M${x} ${y}`;
        for (let s = 0; s < 24; s++) {
          d += ` c${f(rnd() * 20 - 10)} ${f(rnd() * 20 - 10)} ${f(rnd() * 20 - 10)} ${f(rnd() * 20 - 10)} ${f(rnd() * 20 - 10)} ${f(rnd() * 20 - 10)}`;
        }
        parts.push(
          `<path id="p${made}" d="${d} z" fill="${color}" stroke="#000" stroke-width="0.5"/>`,
        );
      } else if (k === 1) {
        parts.push(
          `<circle id="c${made}" cx="${x}" cy="${y}" r="${f(rnd() * 12 + 1)}" fill="${color}"/>`,
        );
      } else {
        parts.push(
          `<rect id="r${made}" x="${x}" y="${y}" width="${f(rnd() * 30 + 2)}" height="${f(rnd() * 30 + 2)}" rx="2" fill="${color}"${opacity ? ' opacity="0.8"' : ''}/>`,
        );
      }
    }
    parts.push('</g>');
    g++;
  }
  parts.push('</svg>');
  return parts.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const nodes = Number(args.find((a) => !a.startsWith('--'))) || undefined;
  process.stdout.write(bigSvg(nodes, undefined, { opacity: !args.includes('--plain') }));
}
