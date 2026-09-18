#!/usr/bin/env node
/**
 * TAHQĪQ — PWA icon generator (SVG → PNG via sharp)
 * Usage: npm run icons
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const BG = '#070B10';

const DEFS = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F1DC9B"/>
      <stop offset="1" stop-color="#B08D1F"/>
    </linearGradient>
  </defs>`;

/** Stylized geometric taa (ت): boat base with upturned ends + two stacked dots */
const MARK = `
  <path d="M150 320 Q 212 374 256 368 Q 300 362 362 320" fill="none" stroke="url(#g)" stroke-width="30" stroke-linecap="round"/>
  <path d="M150 320 Q 138 300 147 282" fill="none" stroke="url(#g)" stroke-width="30" stroke-linecap="round"/>
  <path d="M362 320 Q 374 300 365 282" fill="none" stroke="url(#g)" stroke-width="30" stroke-linecap="round"/>
  <circle cx="256" cy="196" r="27" fill="#E8C766"/>
  <circle cx="256" cy="128" r="27" fill="#E8C766"/>`;

const FRAME = `
  <rect x="88" y="88" width="336" height="336" rx="58" transform="rotate(45 256 256)" fill="rgba(212,175,55,0.09)" stroke="url(#g)" stroke-width="13"/>`;

function svg(inner, scale = 1, ox = 0, oy = 0) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}
  <rect width="512" height="512" fill="${BG}"/>
  <g transform="translate(${ox} ${oy}) scale(${scale})">${inner}</g>
</svg>`;
}

mkdirSync('public/icons', { recursive: true });

const anySvg = svg(`${FRAME}${MARK}`);
// maskable: content scaled into the 80% safe zone
const m = 0.72;
const maskableSvg = svg(`${FRAME}${MARK}`, m, (512 * (1 - m)) / 2, (512 * (1 - m)) / 2);

await sharp(Buffer.from(anySvg)).resize(192, 192).png().toFile('public/icons/icon-192.png');
await sharp(Buffer.from(anySvg)).resize(512, 512).png().toFile('public/icons/icon-512.png');
await sharp(Buffer.from(maskableSvg)).resize(512, 512).png().toFile('public/icons/icon-maskable-512.png');
await sharp(Buffer.from(anySvg)).resize(180, 180).png().toFile('public/apple-touch-icon.png');

console.log('✔ public/icons/icon-192.png');
console.log('✔ public/icons/icon-512.png');
console.log('✔ public/icons/icon-maskable-512.png');
console.log('✔ public/apple-touch-icon.png');
