// One-off verification: inflate PDF content streams and dump visible text operands.
const fs = require('fs');
const zlib = require('zlib');

const file = process.argv[2];
const buf = fs.readFileSync(file);

let text = '';
let idx = 0;
while (true) {
  const s = buf.indexOf('stream', idx);
  if (s === -1) break;
  let start = s + 6;
  if (buf[start] === 0x0d) start++;
  if (buf[start] === 0x0a) start++;
  const e = buf.indexOf('endstream', start);
  if (e === -1) break;
  const chunk = buf.slice(start, e);
  try {
    const inflated = zlib.inflateSync(chunk).toString('latin1');
    // pdfkit emits both "(str) Tj" and kerned "[(a) -12 (b)] TJ"
    for (const m of inflated.matchAll(/\[((?:\\.|[^\]\\]|\\\\)*)\]\s*TJ|\(((?:\\.|[^\\()])*)\)\s*Tj/g)) {
      if (m[2] !== undefined) {
        text += m[2].replace(/\\([()\\])/g, '$1') + '\n';
      } else {
        let line = '';
        for (const p of m[1].matchAll(/\(((?:\\.|[^\\()])*)\)/g)) {
          line += p[1].replace(/\\([()\\])/g, '$1');
        }
        text += line + '\n';
      }
    }
  } catch { /* not a deflate stream (fonts, images) */ }
  idx = e + 9;
}
console.log(text.trim() || '(no extractable text)');
