import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import crypto from "node:crypto"

export function createSurface(width, height, transparent = true, background = [0, 0, 0, 0]) {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const data = new Uint8Array(w * h * 4)
  const bg = transparent ? background : [background[0], background[1], background[2], 255]
  if (bg.some((value) => value !== 0)) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = bg[0]; data[i + 1] = bg[1]; data[i + 2] = bg[2]; data[i + 3] = bg[3]
    }
  }
  return { width: w, height: h, data }
}

export function cloneSurface(surface) {
  return { width: surface.width, height: surface.height, data: new Uint8Array(surface.data) }
}

export function blendPixel(surface, x, y, color) {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || py < 0 || px >= surface.width || py >= surface.height) return
  const index = (py * surface.width + px) * 4
  const sa = Math.max(0, Math.min(255, color[3])) / 255
  if (sa <= 0) return
  const da = surface.data[index + 3] / 255
  const outA = sa + da * (1 - sa)
  if (outA <= 0) return
  surface.data[index] = Math.round((color[0] * sa + surface.data[index] * da * (1 - sa)) / outA)
  surface.data[index + 1] = Math.round((color[1] * sa + surface.data[index + 1] * da * (1 - sa)) / outA)
  surface.data[index + 2] = Math.round((color[2] * sa + surface.data[index + 2] * da * (1 - sa)) / outA)
  surface.data[index + 3] = Math.round(outA * 255)
}

export function fillRect(surface, x, y, width, height, color) {
  const x0 = Math.max(0, Math.floor(x))
  const y0 = Math.max(0, Math.floor(y))
  const x1 = Math.min(surface.width, Math.ceil(x + width))
  const y1 = Math.min(surface.height, Math.ceil(y + height))
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) blendPixel(surface, px, py, color)
  }
}

export function strokeRect(surface, x, y, width, height, thickness, color) {
  fillRect(surface, x, y, width, thickness, color)
  fillRect(surface, x, y + height - thickness, width, thickness, color)
  fillRect(surface, x, y, thickness, height, color)
  fillRect(surface, x + width - thickness, y, thickness, height, color)
}

export function line(surface, x0, y0, x1, y1, thickness, color) {
  const dx = x1 - x0
  const dy = y1 - y0
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))))
  const radius = Math.max(0, Math.floor(thickness / 2))
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const x = Math.round(x0 + dx * t)
    const y = Math.round(y0 + dy * t)
    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        if (ox * ox + oy * oy <= (radius + 0.5) ** 2) blendPixel(surface, x + ox, y + oy, color)
      }
    }
  }
}

export function circle(surface, cx, cy, radius, color, stroke = 0, strokeColor = color) {
  const r = Math.max(0, radius)
  const x0 = Math.max(0, Math.floor(cx - r - stroke))
  const y0 = Math.max(0, Math.floor(cy - r - stroke))
  const x1 = Math.min(surface.width, Math.ceil(cx + r + stroke))
  const y1 = Math.min(surface.height, Math.ceil(cy + r + stroke))
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (distance <= r) blendPixel(surface, x, y, color)
      else if (stroke > 0 && distance <= r + stroke) blendPixel(surface, x, y, strokeColor)
    }
  }
}

export function rotatedRect(surface, cx, cy, width, height, rotation, color, border = null, borderWidth = 0) {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const halfW = width / 2
  const halfH = height / 2
  const radius = Math.hypot(halfW, halfH) + borderWidth + 2
  const x0 = Math.max(0, Math.floor(cx - radius))
  const y0 = Math.max(0, Math.floor(cy - radius))
  const x1 = Math.min(surface.width, Math.ceil(cx + radius))
  const y1 = Math.min(surface.height, Math.ceil(cy + radius))
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const lx = dx * cos + dy * sin
      const ly = -dx * sin + dy * cos
      if (Math.abs(lx) <= halfW && Math.abs(ly) <= halfH) {
        const edge = Math.min(halfW - Math.abs(lx), halfH - Math.abs(ly))
        blendPixel(surface, x, y, border && edge < borderWidth ? border : color)
      }
    }
  }
}

export function fillRotatedBand(surface, cx, cy, width, height, rotation, inset, color) {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const halfW = width / 2 - inset
  const halfH = height / 2 - inset
  if (halfW <= 0 || halfH <= 0) return
  const radius = Math.hypot(width / 2, height / 2) + 2
  const x0 = Math.max(0, Math.floor(cx - radius))
  const y0 = Math.max(0, Math.floor(cy - radius))
  const x1 = Math.min(surface.width, Math.ceil(cx + radius))
  const y1 = Math.min(surface.height, Math.ceil(cy + radius))
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const lx = dx * cos + dy * sin
      const ly = -dx * sin + dy * cos
      if (Math.abs(lx) <= halfW && Math.abs(ly) <= halfH) blendPixel(surface, x, y, color)
    }
  }
}

export function sourceColor(index) {
  const palette = [
    [225, 84, 78, 255], [48, 122, 173, 255], [218, 166, 54, 255], [75, 154, 113, 255],
    [133, 92, 176, 255], [220, 117, 53, 255], [43, 159, 164, 255], [193, 76, 132, 255],
    [92, 111, 184, 255], [145, 154, 61, 255], [194, 96, 73, 255], [78, 139, 120, 255]
  ]
  return palette[((index % palette.length) + palette.length) % palette.length]
}

export function drawArtwork(surface, card, options = {}) {
  const paper = options.paper ?? [239, 235, 224, 255]
  const ink = options.ink ?? [30, 29, 27, 255]
  const frameWidth = Math.max(1, Math.round(Math.min(card.width, card.height) * (options.frameFraction ?? 0.035)))
  const rotation = card.rotation ?? 0
  rotatedRect(surface, card.x, card.y, card.width, card.height, rotation, paper, ink, frameWidth)
  const inset = Math.max(frameWidth * 2.2, Math.min(card.width, card.height) * 0.065)
  if (card.failed) {
    fillRotatedBand(surface, card.x, card.y, card.width, card.height, rotation, inset, [65, 64, 61, 255])
    const cos = Math.cos(rotation), sin = Math.sin(rotation)
    const hw = card.width / 2 - inset * 1.4
    const hh = card.height / 2 - inset * 1.4
    const point = (lx, ly) => [card.x + lx * cos - ly * sin, card.y + lx * sin + ly * cos]
    const a = point(-hw, -hh), b = point(hw, hh), c = point(hw, -hh), d = point(-hw, hh)
    line(surface, a[0], a[1], b[0], b[1], Math.max(1, frameWidth), [220, 213, 198, 255])
    line(surface, c[0], c[1], d[0], d[1], Math.max(1, frameWidth), [220, 213, 198, 255])
    return
  }
  const color = sourceColor(card.sourceIndex ?? 0)
  fillRotatedBand(surface, card.x, card.y, card.width, card.height, rotation, inset, color)
  const cos = Math.cos(rotation), sin = Math.sin(rotation)
  const innerW = Math.max(2, card.width - inset * 2)
  const innerH = Math.max(2, card.height - inset * 2)
  for (let stripe = -2; stripe <= 2; stripe += 1) {
    const lx0 = -innerW * 0.42
    const lx1 = innerW * 0.42
    const ly = stripe * innerH * 0.12
    const x0 = card.x + lx0 * cos - ly * sin
    const y0 = card.y + lx0 * sin + ly * cos
    const x1 = card.x + lx1 * cos - ly * sin
    const y1 = card.y + lx1 * sin + ly * cos
    line(surface, x0, y0, x1, y1, Math.max(1, frameWidth * 0.42), [255, 255, 255, 105])
  }
}

function crcTable() {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}
const CRC_TABLE = crcTable()
function crc32(buffer) {
  let c = 0xffffffff
  for (const value of buffer) c = CRC_TABLE[(c ^ value) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii")
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const out = Buffer.alloc(12 + payload.length)
  out.writeUInt32BE(payload.length, 0)
  typeBuffer.copy(out, 4)
  payload.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, payload])), 8 + payload.length)
  return out
}
export function encodePng(surface) {
  const { width, height, data } = surface
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, row + 1)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4)
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))
  ])
}
export function writePng(file, surface) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, encodePng(surface))
}

export function compositeOver(surface, background) {
  const output = createSurface(surface.width, surface.height, false, [...background, 255])
  for (let i = 0; i < surface.data.length; i += 4) {
    const alpha = surface.data[i + 3] / 255
    output.data[i] = Math.round(surface.data[i] * alpha + background[0] * (1 - alpha))
    output.data[i + 1] = Math.round(surface.data[i + 1] * alpha + background[1] * (1 - alpha))
    output.data[i + 2] = Math.round(surface.data[i + 2] * alpha + background[2] * (1 - alpha))
    output.data[i + 3] = 255
  }
  return output
}

export function checkerboard(width, height, size = 32) {
  const surface = createSurface(width, height, false, [230, 230, 230, 255])
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      const dark = ((Math.floor(x / size) + Math.floor(y / size)) % 2) === 1
      fillRect(surface, x, y, size, size, dark ? [150, 150, 150, 255] : [230, 230, 230, 255])
    }
  }
  return surface
}

export function compositeOverSurface(surface, background) {
  const output = cloneSurface(background)
  for (let i = 0; i < surface.data.length; i += 4) {
    const alpha = surface.data[i + 3] / 255
    output.data[i] = Math.round(surface.data[i] * alpha + background.data[i] * (1 - alpha))
    output.data[i + 1] = Math.round(surface.data[i + 1] * alpha + background.data[i + 1] * (1 - alpha))
    output.data[i + 2] = Math.round(surface.data[i + 2] * alpha + background.data[i + 2] * (1 - alpha))
    output.data[i + 3] = 255
  }
  return output
}

export function alphaDiagnostics(surface) {
  let zeroAlpha = 0, contaminatedZeroAlpha = 0, partialAlpha = 0, opaque = 0
  for (let i = 0; i < surface.data.length; i += 4) {
    const a = surface.data[i + 3]
    if (a === 0) {
      zeroAlpha += 1
      if (surface.data[i] !== 0 || surface.data[i + 1] !== 0 || surface.data[i + 2] !== 0) contaminatedZeroAlpha += 1
    } else if (a === 255) opaque += 1
    else partialAlpha += 1
  }
  return { zeroAlpha, contaminatedZeroAlpha, partialAlpha, opaque, pixels: surface.width * surface.height }
}

export function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}
export function hashTree(root) {
  const output = []
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(file)
      else output.push({ path: path.relative(root, file).split(path.sep).join("/"), bytes: fs.statSync(file).size, sha256: sha256File(file) })
    }
  }
  walk(root)
  return output
}
