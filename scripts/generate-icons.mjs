#!/usr/bin/env node
// Generates the PWA app icons as plain PNGs, with zero image-library
// dependencies — just a minimal hand-rolled PNG encoder (raw RGBA
// scanlines + zlib deflate, the two things a PNG actually needs beyond
// the file format bookkeeping below).
//
// The icon itself: three overlapping circles in the X / Substack /
// Mastodon badge colors already used in the UI, over the app's accent
// blue, representing the three sources merging into one feed.
//
// Run manually whenever the icon design changes:
//   node scripts/generate-icons.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT_DIR = path.join(process.cwd(), "public", "icons");

const ACCENT = [0x2f, 0x6f, 0xed];
const BADGE_COLORS = [
  [0x00, 0x00, 0x00], // X
  [0xff, 0x67, 0x19], // Substack
  [0x63, 0x64, 0xff], // Mastodon
];

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = makeCrcTable());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    crc = (crc >>> 8) ^ table[c];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idatData = zlib.deflateSync(raw);

  return Buffer.concat([signature, chunk("IHDR", ihdrData), chunk("IDAT", idatData), chunk("IEND", Buffer.alloc(0))]);
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const badgeRadius = size * 0.19;
  const orbitRadius = size * 0.14;
  const centers = BADGE_COLORS.map((color, i) => {
    const angle = (Math.PI * 2 * i) / BADGE_COLORS.length - Math.PI / 2;
    return { x: cx + Math.cos(angle) * orbitRadius, y: cy + Math.sin(angle) * orbitRadius, color };
  });

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      let color = ACCENT;
      let alpha = 255;

      for (const c of centers) {
        const dx = x - c.x;
        const dy = y - c.y;
        if (dx * dx + dy * dy <= badgeRadius * badgeRadius) {
          color = c.color;
        }
      }

      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = alpha;
    }
  }

  return rgba;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const sizes = [
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
  { size: 180, name: "apple-touch-icon.png" },
];

for (const { size, name } of sizes) {
  const png = encodePng(size, size, drawIcon(size));
  const outPath = path.join(OUT_DIR, name);
  fs.writeFileSync(outPath, png);
  console.log(`Wrote ${outPath} (${png.length} bytes)`);
}
