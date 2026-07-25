// Generates build/icon.png (512x512) for electron-builder.
// No dependencies: hand-rolled PNG encoder using zlib.
// Usage: node build/generate-icon.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 512;
const RADIUS = 112; // rounded-corner radius (macOS squircle-ish)

// Colors (match electron/main.js backgroundColor + a light accent)
const BG = [0x1a, 0x1a, 0x2e];
const FG = [0x9d, 0x8c, 0xff];

function inRoundedRect(x, y) {
  const r = RADIUS;
  const cx = Math.min(Math.max(x, r), SIZE - r);
  const cy = Math.min(Math.max(y, r), SIZE - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// Stylized π glyph built from rectangles (canvas coordinates)
function inGlyph(x, y) {
  const topBar = x >= 156 && x <= 356 && y >= 156 && y <= 196;
  const leftLeg = x >= 196 && x <= 236 && y >= 156 && y <= 356;
  const rightLeg = x >= 276 && x <= 316 && y >= 156 && y <= 356;
  return topBar || leftLeg || rightLeg;
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
let o = 0;
for (let y = 0; y < SIZE; y++) {
  raw[o++] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    if (!inRoundedRect(x, y)) {
      raw[o++] = 0; raw[o++] = 0; raw[o++] = 0; raw[o++] = 0; // transparent
    } else if (inGlyph(x, y)) {
      raw[o++] = FG[0]; raw[o++] = FG[1]; raw[o++] = FG[2]; raw[o++] = 255;
    } else {
      raw[o++] = BG[0]; raw[o++] = BG[1]; raw[o++] = BG[2]; raw[o++] = 255;
    }
  }
}

// ── minimal PNG encoder ──
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type: RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(__dirname, "icon.png");
fs.writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes)`);
