/**
 * resources/icon.png (256x256) үүсгэнэ — гуравдагч сан ашиглахгүй,
 * Node-ийн zlib-ээр PNG кодлоно. Yriya-ийн лого: дуу хоолойн долгион.
 */
const zlib = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type RGBA
  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

function roundRectDist(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - hw + r
  const dy = Math.abs(py - cy) - hh + r
  const ox = Math.max(dx, 0)
  const oy = Math.max(dy, 0)
  const outside = Math.sqrt(ox * ox + oy * oy)
  const inside = Math.min(Math.max(dx, dy), 0)
  return outside + inside - r
}

const cov = (d) => Math.max(0, Math.min(1, 0.5 - d))
const lerp = (a, b, t) => a + (b - a) * t

function render(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const s = size / 256
  const c = size / 2
  const bgHalf = 126 * s
  const bgR = 58 * s
  const barW = 22 * s
  const gap = 18 * s
  const heights = [0.42, 0.68, 1.0, 0.6, 0.38]
  const maxBarH = 152 * s
  const totalW = barW * 5 + gap * 4
  const startX = c - totalW / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const idx = (y * size + x) * 4
      const bgC = cov(roundRectDist(px, py, c, c, bgHalf, bgHalf, bgR))
      if (bgC <= 0) {
        rgba[idx] = rgba[idx + 1] = rgba[idx + 2] = rgba[idx + 3] = 0
        continue
      }
      const t = Math.max(0, Math.min(1, (px / size + py / size) / 2))
      let r = lerp(139, 34, t)
      let g = lerp(92, 211, t)
      let b = lerp(246, 238, t)
      let barC = 0
      for (let i = 0; i < 5; i++) {
        const bx = startX + i * (barW + gap) + barW / 2
        const bh = heights[i] * maxBarH
        barC = Math.max(barC, cov(roundRectDist(px, py, bx, c, barW / 2, bh / 2, barW / 2)))
      }
      r = lerp(r, 255, barC)
      g = lerp(g, 255, barC)
      b = lerp(b, 255, barC)
      rgba[idx] = Math.round(r)
      rgba[idx + 1] = Math.round(g)
      rgba[idx + 2] = Math.round(b)
      rgba[idx + 3] = Math.round(bgC * 255)
    }
  }
  return rgba
}

const outDir = path.join(__dirname, '..', 'resources')
fs.mkdirSync(outDir, { recursive: true })
const size = 256
fs.writeFileSync(path.join(outDir, 'icon.png'), encodePng(size, size, render(size)))
console.log(`resources/icon.png үүслээ (${size}x${size})`)
