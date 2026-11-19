// Генерация простых PNG-иконок PWA (192x192 и 512x512) без внешних зависимостей.
// Фон #4f46e5, белая сетка-календарь 5x8.
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')

const crcTable = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c
}
function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function makePng(size) {
  const bg = [0x4f, 0x46, 0xe5]
  const fg = [0xff, 0xff, 0xff]
  const margin = Math.round(size * 0.14)
  const gap = Math.round(size * 0.02)
  const cols = 5
  const rows = 8
  const cw = (size - 2 * margin - (cols - 1) * gap) / cols
  const ch = (size - 2 * margin - (rows - 1) * gap) / rows

  const pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = bg
      outer: for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x0 = margin + c * (cw + gap)
          const y0 = margin + r * (ch + gap)
          if (x >= x0 && x < x0 + cw && y >= y0 && y < y0 + ch) {
            color = fg
            break outer
          }
        }
      }
      const i = (y * size + x) * 4
      pixels[i] = color[0]
      pixels[i + 1] = color[1]
      pixels[i + 2] = color[2]
      pixels[i + 3] = 255
    }
  }

  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

fs.mkdirSync(publicDir, { recursive: true })
for (const size of [192, 512]) {
  const file = path.join(publicDir, `pwa-${size}x${size}.png`)
  fs.writeFileSync(file, makePng(size))
  console.log(`created ${file}`)
}
