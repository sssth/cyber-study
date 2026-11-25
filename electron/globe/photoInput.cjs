const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const execFile = require('node:util').promisify(require('node:child_process').execFile);

// ImageIO decodes the primary HEIF image and transfers its EXIF to a bounded JPEG.
async function readablePhoto(bytes) {
  if (bytes.toString('ascii', 4, 8) !== 'ftyp') return bytes;
  const end = Math.min(bytes.readUInt32BE(0), bytes.length);
  const brands = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);
  let heif = false;
  for (let offset = 8; offset + 4 <= end; offset += 4) {
    if (offset !== 12 && brands.has(bytes.toString('ascii', offset, offset + 4))) { heif = true; break; }
  }
  if (!heif) return bytes;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'globe-photo-'));
  try {
    const input = path.join(dir, 'input.heic'), output = path.join(dir, 'preview.jpg');
    await fs.writeFile(input, bytes);
    await execFile('/usr/bin/sips', ['-s', 'format', 'jpeg', '-Z', '1800', input, '--out', output], { timeout: 60000 });
    return await fs.readFile(output);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
module.exports = { readablePhoto };
