import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = (c >>> 8) ^ crcTable[(c ^ b) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeB = Buffer.from(type);
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
  const crcIn = Buffer.concat([typeB, data]);
  const crcB = Buffer.allocUnsafe(4); crcB.writeUInt32BE(crc32(crcIn));
  return Buffer.concat([len, typeB, data, crcB]);
}

function createIcon(size) {
  const pixels = Buffer.alloc(size * size * 4); // RGBA

  const cx = size / 2, cy = size / 2;
  const radius = size * 0.42;
  const padding = size * 0.12;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Background: #07090D
      let r = 7, g = 9, b = 13, a = 255;

      // Rounded rect background with subtle gradient
      const rx = x - cx, ry = y - cy;
      const dist = Math.sqrt(rx * rx + ry * ry);

      // Draw a 4-pointed star (✦) shape
      // Using polar coordinates: |cos(2θ)| determines star boundary
      const angle = Math.atan2(ry, rx);
      const starRadius = radius * (0.55 + 0.45 * Math.pow(Math.abs(Math.cos(2 * angle)), 0.6));

      if (dist < starRadius) {
        // Gradient from #6AA8FF to #B18DFF based on angle
        const t = (Math.sin(angle) + 1) / 2;
        r = Math.round(106 + t * (177 - 106));
        g = Math.round(168 + t * (141 - 168));
        b = Math.round(255 + t * (255 - 255));
        // Fade edges
        const edge = Math.max(0, 1 - (dist / starRadius) * 0.15);
        a = Math.round(255 * edge);
      }

      pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = a;
    }
  }

  // Build PNG with RGBA (color type 6)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const scanlines = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    scanlines[y * (1 + size * 4)] = 0; // filter: None
    pixels.copy(scanlines, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const compressed = deflateSync(scanlines, { level: 6 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('public/icon-192.png', createIcon(192));
writeFileSync('public/icon-512.png', createIcon(512));
console.log('Icons generated: public/icon-192.png, public/icon-512.png');
