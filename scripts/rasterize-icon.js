/**
 * Rasterize assets/icon.svg into PNGs and ICO at multiple sizes.
 * Run: node scripts/rasterize-icon.js
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SVG = path.join(ROOT, 'assets', 'icon.svg');
const ASSETS = path.join(ROOT, 'assets');

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

async function main() {
  if (!fs.existsSync(SVG)) {
    console.error('SVG not found at', SVG);
    process.exit(1);
  }

  const svgBuffer = fs.readFileSync(SVG);

  // PNG at every size
  for (const size of SIZES) {
    const out = path.join(ASSETS, `icon-${size}.png`);
    await sharp(svgBuffer).resize(size, size).png().toFile(out);
    const stat = fs.statSync(out);
    console.log(`wrote ${out} (${size}x${size}, ${stat.size} bytes)`);
  }

  // Default icon.png at 512
  fs.copyFileSync(
    path.join(ASSETS, 'icon-512.png'),
    path.join(ASSETS, 'icon.png')
  );
  console.log('wrote assets/icon.png (512x512)');

  // Multi-size ICO containing 16/24/32/48/64/128/256. sharp lacks an ICO
  // encoder, so we hand-pack PNG payloads into an ICO container.
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoPngs = await Promise.all(
    icoSizes.map(s => sharp(svgBuffer).resize(s, s).png().toBuffer())
  );

  const ICONDIR_SIZE = 6;
  const ICONDIRENTRY_SIZE = 16;
  const headerSize = ICONDIR_SIZE + ICONDIRENTRY_SIZE * icoSizes.length;
  const totalSize = headerSize + icoPngs.reduce((sum, b) => sum + b.length, 0);
  const ico = Buffer.alloc(totalSize);
  let offset = 0;

  // ICONDIR: reserved(2)=0, type(2)=1 (icon), count(2)
  ico.writeUInt16LE(0, offset); offset += 2;
  ico.writeUInt16LE(1, offset); offset += 2;
  ico.writeUInt16LE(icoSizes.length, offset); offset += 2;

  // ICONDIRENTRY per image
  const dataOffsets = [];
  let dataCursor = headerSize;
  for (let i = 0; i < icoSizes.length; i++) {
    const s = icoSizes[i];
    ico.writeUInt8(s === 256 ? 0 : s, offset); offset += 1; // width (0 means 256)
    ico.writeUInt8(s === 256 ? 0 : s, offset); offset += 1; // height
    ico.writeUInt8(0, offset); offset += 1; // colors in palette
    ico.writeUInt8(0, offset); offset += 1; // reserved
    ico.writeUInt16LE(1, offset); offset += 2; // color planes
    ico.writeUInt16LE(32, offset); offset += 2; // bits per pixel
    ico.writeUInt32LE(icoPngs[i].length, offset); offset += 4; // size of image data
    ico.writeUInt32LE(dataCursor, offset); offset += 4; // offset
    dataOffsets.push(dataCursor);
    dataCursor += icoPngs[i].length;
  }

  // Image data
  for (let i = 0; i < icoPngs.length; i++) {
    icoPngs[i].copy(ico, dataOffsets[i]);
  }

  const icoPath = path.join(ASSETS, 'icon.ico');
  fs.writeFileSync(icoPath, ico);
  console.log(`wrote ${icoPath} (multi-size ICO, ${ico.length} bytes)`);
}

main().catch(err => {
  console.error('Rasterize failed:', err);
  process.exit(1);
});
