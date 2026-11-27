// Read bounded TIFF EXIF fields from JPEG; absent or malformed metadata stays unknown.
function metadata(bytes) {
  const result = {};
  try {
    if (bytes.readUInt16BE(0) !== 0xffd8) return result;
    let start = 2;
    while (start + 4 < bytes.length) {
      if (bytes[start] !== 255 || bytes[start + 1] === 218) break;
      const length = bytes.readUInt16BE(start + 2);
      if (length < 2 || start + 2 + length > bytes.length) break;
      if (bytes[start + 1] === 225 && bytes.toString('ascii', start + 4, start + 10) === 'Exif\0\0') {
        const t = bytes.subarray(start + 10, start + 2 + length);
        const le = t.toString('ascii', 0, 2) === 'II';
        if (!le && t.toString('ascii', 0, 2) !== 'MM') return result;
        const u16 = p => le ? t.readUInt16LE(p) : t.readUInt16BE(p);
        const u32 = p => le ? t.readUInt32LE(p) : t.readUInt32BE(p);
        if (u16(2) !== 42) return result;
        const directory = offset => {
          const fields = {};
          const count = u16(offset);
          if (count > 512 || offset + 2 + count * 12 > t.length) throw new Error();
          for (let i = 0; i < count; i++) {
            const p = offset + 2 + i * 12, tag = u16(p), type = u16(p + 2), n = u32(p + 4);
            const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 10: 8 })[type];
            if (!size || n > 4096) continue;
            const loc = n * size <= 4 ? p + 8 : u32(p + 8);
            if (loc + n * size > t.length) continue;
            if (type === 2) fields[tag] = t.toString('ascii', loc, loc + n).replace(/\0.*$/, '');
            if (type === 3) fields[tag] = u16(loc);
            if (type === 4) fields[tag] = u32(loc);
            if (type === 5 || type === 10) {
              const read = type === 5 ? u32 : p => le ? t.readInt32LE(p) : t.readInt32BE(p);
              fields[tag] = Array.from({ length: n }, (_, k) => read(loc + k * 8) / read(loc + k * 8 + 4));
            }
          }
          return fields;
        };
        const root = directory(u32(4));
        const exif = root[0x8769] ? directory(root[0x8769]) : {};
        const date = exif[0x9003];
        if (/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(date || '')) {
          result.date = date.slice(0, 10).replaceAll(':', '-');
          result.time = date.slice(11,16);
        }
        if (root[0x8825]) {
          const gps = directory(root[0x8825]);
          const degrees = parts => parts?.length === 3 ? parts[0] + parts[1] / 60 + parts[2] / 3600 : NaN;
          const lat = degrees(gps[2]) * (gps[1] === 'S' ? -1 : 1);
          const lon = degrees(gps[4]) * (gps[3] === 'W' ? -1 : 1);
          if (['N', 'S'].includes(gps[1]) && ['E', 'W'].includes(gps[3]) && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) Object.assign(result, { latitude: lat, longitude: lon });
        }
        return result;
      }
      start += length + 2;
    }
  } catch { /* A damaged EXIF block must not reject an otherwise decodable photo. */ }
  return result;
}
module.exports = { metadata };
